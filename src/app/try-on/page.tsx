"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useRef, useState } from "react";
import { Upload, ImageIcon, X, Sparkles, Check, AlertCircle, Camera } from "lucide-react";

import { Skeleton } from "@/components/ui/skeleton";

import {
  generateTryOn,
  getProduct,
  getProducts,
  resolveAssetUrl,
  uploadUserPhoto,
} from "@/lib/api";
import { type Gender, type Product } from "@/lib/products";
import { ProductCard } from "@/components/site/ProductCard";

const LOADING_STEPS = [
  "Analyzing your photo",
  "Applying selected outfit",
  "Preserving pose and background",
  "Generating final preview",
];

export default function TryOn() {
  return (
    <Suspense
      fallback={
        <div className="grid min-h-[60vh] place-items-center">
          <p className="text-sm text-muted-foreground">Loading try-on studio...</p>
        </div>
      }
    >
      <TryOnContent />
    </Suspense>
  );
}

function TryOnContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const fileRef = useRef<HTMLInputElement>(null);
  const initialId = searchParams.get("product");
  const initialSize = searchParams.get("size") ?? "";
  const [products, setProducts] = useState<Product[]>([]);
  const [loadingProducts, setLoadingProducts] = useState(true);
  const [photo, setPhoto] = useState<string | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [selected, setSelected] = useState<Product | null>(null);
  const [selectedSize, setSelectedSize] = useState<string>(initialSize);
  const [userBodySize, setUserBodySize] = useState<string>("");
  const [genderFilter, setGenderFilter] = useState<"all" | Gender>("all");
  const [catFilter, setCatFilter] = useState<string>("all");
  const [dragOver, setDragOver] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [loading, setLoading] = useState(false);
  const [step, setStep] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [prompt, setPrompt] = useState("");
  const [showUploadOptions, setShowUploadOptions] = useState(false);

  // Restore previously uploaded photo from session
  useEffect(() => {
    const p = sessionStorage.getItem("tryon:photo");
    if (p) {
      setPhoto(p);
      setPhotoPreview(resolveAssetUrl(p));
    }
  }, []);

  // Load all backend products for the outfit picker
  useEffect(() => {
    setLoadingProducts(true);
    getProducts()
      .then((loadedProducts) => {
        setProducts(loadedProducts);
      })
      .catch(() => setProducts([]))
      .finally(() => setLoadingProducts(false));
  }, []);

  // If a product ID is passed via ?product=, fetch it directly from the backend
  useEffect(() => {
    if (!initialId) return;
    getProduct(initialId)
      .then((loadedProduct) => {
        if (loadedProduct) {
          setSelected(loadedProduct);
          // Auto-select size: prefer URL param, then first available size
          if (
            !initialSize &&
            loadedProduct.available_sizes &&
            loadedProduct.available_sizes.length > 0
          ) {
            setSelectedSize(loadedProduct.available_sizes[0]);
          }
        }
      })
      .catch((err) => {
        console.error("Could not pre-select product.");
      });
  }, [initialId, initialSize]);

  // Auto-select size when selected product changes
  useEffect(() => {
    if (selected) {
      const sizes =
        selected.available_sizes && selected.available_sizes.length > 0
          ? selected.available_sizes
          : ["XS", "S", "M", "L", "XL", "XXL"];
      if (!selectedSize || !sizes.includes(selectedSize)) {
        setSelectedSize(sizes[0]);
      }
    } else {
      setSelectedSize("");
    }
  }, [selected, selectedSize]);

  const cats = ["all", ...Array.from(new Set(products.map((p) => p.category)))];
  const filtered = products.filter(
    (p) =>
      (genderFilter === "all" || p.gender === genderFilter) &&
      (catFilter === "all" || p.category === catFilter),
  );

  async function handleFile(file?: File | null) {
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setError("Please upload an image file (JPG, PNG, or WebP).");
      return;
    }

    const previewUrl = URL.createObjectURL(file);
    setPhotoPreview(previewUrl);
    setUploading(true);
    setError(null);

    try {
      const imageUrl = await uploadUserPhoto(file);
      setPhoto(imageUrl);
      setPhotoPreview(resolveAssetUrl(imageUrl));
      sessionStorage.setItem("tryon:photo", imageUrl);
      setError(null);
    } catch (err) {
      setPhoto(null);
      setPhotoPreview(null);
      sessionStorage.removeItem("tryon:photo");
      setError(err instanceof Error ? err.message : "Could not upload photo.");
    } finally {
      setUploading(false);
      URL.revokeObjectURL(previewUrl);
    }
  }

  function clearPhoto() {
    setPhoto(null);
    setPhotoPreview(null);
    sessionStorage.removeItem("tryon:photo");
  }

  async function generate() {
    if (!photo) {
      setError("Please upload a photo first.");
      return;
    }
    if (uploading) {
      setError("Please wait for the photo upload to finish.");
      return;
    }
    if (!selected) {
      setError("Please select an outfit.");
      return;
    }
    if (!selectedSize) {
      setError("Please select the Try-On Garment Size.");
      return;
    }
    if (!userBodySize) {
      setError("Please select your Normal Body Size.");
      return;
    }
    setError(null);
    setLoading(true);
    setStep(0);
    const progress = window.setInterval(() => {
      setStep((current) => Math.min(current + 1, LOADING_STEPS.length - 1));
    }, 1200);

    try {
      const result = await generateTryOn({
        user_image_url: photo,
        product_id: selected.id,
        selected_size: selectedSize,
        user_body_size: userBodySize,
        prompt_optional: prompt.trim() || undefined,
      });
      window.clearInterval(progress);
      setStep(LOADING_STEPS.length);
      sessionStorage.setItem("tryon:lastResultId", result.id);
      router.push(`${pathname.startsWith("/admin") ? "/admin/result" : "/result"}?id=${result.id}`);
    } catch (err) {
      window.clearInterval(progress);
      setLoading(false);
      setError(err instanceof Error ? err.message : "Could not generate try-on preview.");
    }
  }

  return (
    <div className="bg-background pb-28 md:pb-12">
      <section className="bg-gradient-cream">
        <div className="mx-auto max-w-7xl px-5 py-10 sm:px-8 md:py-14">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-gold">
            Try-On Studio
          </p>
          <h1 className="mt-3 font-display text-4xl text-charcoal sm:text-5xl">Create your look</h1>
          <p className="mt-3 max-w-xl text-sm text-muted-foreground sm:text-base">
            Add a clear full-body photo, pick an outfit, and we'll generate a preview in seconds.
          </p>
        </div>
      </section>

      <section className="mx-auto grid max-w-7xl gap-8 px-5 py-10 sm:px-8 lg:grid-cols-[1fr_1.4fr]">
        <div className="space-y-5">
          <div className="rounded-3xl border border-border bg-card p-6 shadow-soft">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg text-foreground">1. Your photo</h2>
              {photo && (
                <button
                  onClick={clearPhoto}
                  className="inline-flex items-center gap-1 rounded-full border border-border px-3 py-1.5 text-xs text-muted-foreground hover:border-charcoal hover:text-foreground"
                >
                  <X className="h-3 w-3" /> Remove
                </button>
              )}
            </div>

            {photoPreview ? (
              <div className="overflow-hidden rounded-2xl border border-border bg-cream">
                <img
                  src={photoPreview}
                  alt="Uploaded preview"
                  className="max-h-[500px] w-full object-contain"
                />
              </div>
            ) : (
              <div
                onClick={() => setShowUploadOptions(true)}
                onDragOver={(e) => {
                  e.preventDefault();
                  setDragOver(true);
                }}
                onDragLeave={() => setDragOver(false)}
                onDrop={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  setDragOver(false);
                  handleFile(e.dataTransfer.files?.[0]);
                }}
                className={`flex cursor-pointer flex-col items-center justify-center gap-3 rounded-2xl border-2 border-dashed px-6 py-14 text-center transition ${
                  dragOver
                    ? "border-charcoal bg-cream"
                    : "border-border bg-cream/40 hover:border-charcoal/40"
                }`}
              >
                <span className="grid h-14 w-14 place-items-center rounded-full bg-gradient-gold text-charcoal">
                  <Upload className="h-5 w-5" />
                </span>
                <div>
                  <p className="text-sm font-medium text-foreground">
                    Upload a clear full-body photo
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Drag & drop, or click to browse
                  </p>
                </div>
                <input
                  ref={fileRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onClick={(e) => e.stopPropagation()}
                  onChange={(e) => handleFile(e.target.files?.[0])}
                />
              </div>
            )}

            <ul className="mt-5 space-y-2">
              {[
                "Use a front-facing photo",
                "Good, even lighting",
                "Avoid covered or cropped body",
              ].map((t) => (
                <li key={t} className="flex items-start gap-2 text-xs text-muted-foreground">
                  <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-gold" />
                  {t}
                </li>
              ))}
            </ul>
            {uploading && (
              <p className="mt-4 text-xs font-medium text-muted-foreground">
                Uploading photo to backend...
              </p>
            )}

            {/* My Normal Body Size Selector */}
            <div className="mt-5 space-y-2.5 border-t border-border pt-5">
              <div className="flex items-center justify-between">
                <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                  My Normal Body Size
                </p>
                {userBodySize && (
                  <span className="text-[10px] font-bold uppercase tracking-wider text-gold">
                    Size {userBodySize} selected
                  </span>
                )}
              </div>
              <div className="flex flex-wrap gap-2">
                {["XS", "S", "M", "L", "XL", "XXL"].map((size) => (
                  <button
                    key={size}
                    type="button"
                    onClick={() => setUserBodySize(size)}
                    className={`h-9 min-w-[40px] rounded-lg border px-2.5 text-[10px] font-bold uppercase tracking-wide transition ${
                      userBodySize === size
                        ? "border-transparent bg-charcoal text-primary-foreground"
                        : "border-border bg-background text-foreground hover:border-charcoal"
                    }`}
                  >
                    {size}
                  </button>
                ))}
              </div>
              {!userBodySize && (
                <p className="text-[10px] italic text-muted-foreground">
                  Please select your normal body size.
                </p>
              )}
            </div>
          </div>

          {selected && (
            <div className="rounded-3xl border border-border bg-card p-5 shadow-soft space-y-4">
              {/* Selected outfit preview */}
              <div>
                <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Selected outfit
                </p>
                <div className="flex items-center gap-4">
                  <img
                    src={resolveAssetUrl(selected.image)}
                    alt={selected.name}
                    className="h-20 w-16 rounded-xl object-cover"
                  />
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-foreground">{selected.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {selected.category} · ৳{selected.price}
                    </p>
                    {selected.cloth_type && (
                      <p className="text-[10px] text-muted-foreground mt-0.5">
                        {selected.cloth_type}
                      </p>
                    )}
                  </div>
                </div>
              </div>

              {/* Try-On Garment Size Selector */}
              <div className="border-t border-border pt-4 space-y-2.5">
                <div className="flex items-center justify-between">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                    Try-On Garment Size
                  </p>
                  {selectedSize && (
                    <span className="text-[10px] font-bold text-gold uppercase tracking-wider">
                      Size {selectedSize} selected
                    </span>
                  )}
                </div>
                <div className="flex flex-wrap gap-2">
                  {(selected.available_sizes && selected.available_sizes.length > 0
                    ? selected.available_sizes
                    : ["XS", "S", "M", "L", "XL", "XXL"]
                  ).map((size) => (
                    <button
                      key={size}
                      type="button"
                      onClick={() => setSelectedSize(size)}
                      className={`min-w-[40px] h-9 rounded-lg border text-[10px] font-bold uppercase tracking-wide transition px-2.5 ${
                        selectedSize === size
                          ? "bg-charcoal border-transparent text-primary-foreground"
                          : "border-border text-foreground hover:border-charcoal bg-background"
                      }`}
                    >
                      {size}
                    </button>
                  ))}
                </div>
                {!selectedSize && (
                  <p className="text-[10px] text-muted-foreground italic">
                    Please select the garment size to try-on.
                  </p>
                )}
              </div>


              {/* Try-On / Styling Instructions Input */}
              <div className="border-t border-border pt-4 space-y-2">
                <label className="block space-y-1.5">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                    Styling & Try-on Instructions (Optional)
                  </span>
                  <textarea
                    value={prompt}
                    onChange={(e) => setPrompt(e.target.value)}
                    placeholder="e.g. Tuck the shirt in, roll up the sleeves, style it loosely draped"
                    className="w-full rounded-xl border border-border bg-background px-4 py-3 text-xs text-foreground placeholder:text-muted-foreground/60 focus:border-charcoal focus:outline-none min-h-[60px] resize-y leading-relaxed"
                  />
                </label>
              </div>
            </div>
          )}

          <button
            onClick={generate}
            className="hidden w-full items-center justify-center gap-2 rounded-full bg-charcoal py-4 text-sm font-medium text-primary-foreground shadow-luxe transition hover:opacity-90 md:inline-flex"
          >
            <Sparkles className="h-4 w-4" /> Generate Try-On
          </button>

          {error && (
            <div className="flex items-start gap-2 rounded-2xl border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
              {error}
            </div>
          )}
        </div>

        <div>
          <div className="rounded-3xl border border-border bg-card p-6 shadow-soft">
            <h2 className="mb-5 text-lg text-foreground">2. Choose an outfit</h2>

            <div className="mb-4 flex flex-wrap gap-2">
              {(["all", "male", "female", "unisex"] as const).map((g) => (
                <button
                  key={g}
                  onClick={() => setGenderFilter(g)}
                  className={`rounded-full px-4 py-1.5 text-xs font-medium capitalize transition ${
                    genderFilter === g
                      ? "bg-charcoal text-primary-foreground"
                      : "border border-border text-foreground hover:border-charcoal"
                  }`}
                >
                  {g}
                </button>
              ))}
            </div>

            <div className="mb-6 flex flex-wrap gap-2">
              {cats.map((c) => (
                <button
                  key={c}
                  onClick={() => setCatFilter(c)}
                  className={`rounded-full px-3.5 py-1 text-[11px] uppercase tracking-wider transition ${
                    catFilter === c
                      ? "bg-cream-deep text-charcoal"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {c === "all" ? "All categories" : c}
                </button>
              ))}
            </div>

            {loadingProducts ? (
              <div className="grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-3">
                {Array.from({ length: 6 }).map((_, i) => (
                  <div
                    key={i}
                    className="space-y-3 rounded-2xl border border-neutral-100 p-3 bg-white"
                  >
                    <Skeleton className="aspect-[3/4] w-full rounded-xl" />
                    <Skeleton className="h-4 w-2/3" />
                    <Skeleton className="h-4 w-1/3" />
                  </div>
                ))}
              </div>
            ) : filtered.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-border bg-cream/40 p-12 text-center">
                <ImageIcon className="mx-auto h-8 w-8 text-muted-foreground" />
                <p className="mt-3 text-sm text-muted-foreground">
                  No outfits in this category yet.
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-3">
                {filtered.map((p) => (
                  <ProductCard
                    key={p.id}
                    product={p}
                    variant="select"
                    selected={selected?.id === p.id}
                    onSelect={setSelected}
                  />
                ))}
              </div>
            )}
          </div>
        </div>
      </section>

      <div className="fixed inset-x-0 bottom-0 z-30 border-t border-border bg-background/95 p-4 backdrop-blur-xl md:hidden">
        <button
          onClick={generate}
          className="flex w-full items-center justify-center gap-2 rounded-full bg-charcoal py-4 text-sm font-medium text-primary-foreground shadow-luxe"
        >
          <Sparkles className="h-4 w-4" /> Generate Try-On
        </button>
      </div>

      {loading && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-charcoal/60 p-5 backdrop-blur">
          <div className="w-full max-w-md rounded-3xl bg-background p-8 shadow-luxe">
            <div className="mb-6 flex items-center gap-3">
              <span className="grid h-11 w-11 animate-pulse place-items-center rounded-full bg-gradient-gold text-charcoal">
                <Sparkles className="h-5 w-5" />
              </span>
              <div>
                <h3 className="text-lg text-foreground">Creating your virtual try-on...</h3>
                <p className="text-xs text-muted-foreground">
                  Hold tight, this takes a few seconds.
                </p>
              </div>
            </div>
            <ul className="space-y-3">
              {LOADING_STEPS.map((s, i) => {
                const done = i < step;
                const active = i === step;
                return (
                  <li key={s} className="flex items-center gap-3 text-sm">
                    <span
                      className={`grid h-6 w-6 place-items-center rounded-full text-[10px] transition ${
                        done
                          ? "bg-charcoal text-primary-foreground"
                          : active
                            ? "bg-gradient-gold text-charcoal"
                            : "bg-cream-deep text-muted-foreground"
                      }`}
                    >
                      {done ? <Check className="h-3 w-3" /> : i + 1}
                    </span>
                    <span className={done || active ? "text-foreground" : "text-muted-foreground"}>
                      {s}
                    </span>
                  </li>
                );
              })}
            </ul>
          </div>
        </div>
      )}

      {showUploadOptions && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm">
          <div className="w-full max-w-sm rounded-3xl bg-white p-6 shadow-xl space-y-4">
            <div className="text-center">
              <h3 className="text-lg font-semibold text-charcoal">Choose Photo Source</h3>
              <p className="text-xs text-muted-foreground mt-1">
                Take a new photo with your camera or select one from your library
              </p>
            </div>

            <div className="grid grid-cols-2 gap-4 pt-2">
              <button
                type="button"
                onClick={() => {
                  setShowUploadOptions(false);
                  if (fileRef.current) {
                    fileRef.current.setAttribute("capture", "user");
                    fileRef.current.click();
                  }
                }}
                className="flex flex-col items-center justify-center gap-3 rounded-2xl border border-border bg-[#FAF9F6] p-4 text-center transition hover:border-charcoal hover:bg-cream/40"
              >
                <span className="grid h-12 w-12 place-items-center rounded-full bg-gradient-gold text-charcoal">
                  <Camera className="h-5 w-5" />
                </span>
                <span className="text-xs font-semibold text-charcoal uppercase tracking-wider">
                  Camera
                </span>
              </button>

              <button
                type="button"
                onClick={() => {
                  setShowUploadOptions(false);
                  if (fileRef.current) {
                    fileRef.current.removeAttribute("capture");
                    fileRef.current.click();
                  }
                }}
                className="flex flex-col items-center justify-center gap-3 rounded-2xl border border-border bg-[#FAF9F6] p-4 text-center transition hover:border-charcoal hover:bg-cream/40"
              >
                <span className="grid h-12 w-12 place-items-center rounded-full bg-gradient-gold text-charcoal">
                  <ImageIcon className="h-5 w-5" />
                </span>
                <span className="text-xs font-semibold text-charcoal uppercase tracking-wider">
                  Gallery
                </span>
              </button>
            </div>

            <button
              type="button"
              onClick={() => setShowUploadOptions(false)}
              className="w-full rounded-xl border border-border py-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground hover:bg-neutral-50"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
