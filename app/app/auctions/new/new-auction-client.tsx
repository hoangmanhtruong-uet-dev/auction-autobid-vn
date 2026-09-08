"use client";

import { useState, useEffect, FormEvent } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { AlertCircle, CheckCircle, Image as ImageIcon, Clock, Calendar, Lock, Info, ChevronRight, X, ArrowLeft, WifiOff, Sparkles, Shield, Tag, Boxes } from "lucide-react";

import { useNetworkStatus } from "@/hooks/use-network-status";

import { Button } from "../../../components/ui/button";
import { Input } from "../../../components/ui/input";
import { Label } from "../../../components/ui/label";
import { Textarea } from "../../../components/ui/textarea";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "../../../components/ui/card";
import { Alert, AlertDescription } from "../../../components/ui/alert";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "../../../components/ui/dialog";
import { Badge } from "../../../components/ui/badge";
import { formatCurrency, formatNumberWithCommas } from "@/lib/utils";
import { createAuction } from "@/src/actions/auction";

const CATEGORY_OPTIONS = [
  { value: "Đồng hồ", label: "Đồng hồ", description: "Đồng hồ đeo tay, đồng hồ bỏ túi, đồng hồ cổ" },
  { value: "Điện thoại", label: "Điện thoại", description: "Điện thoại di động, smartphone, máy cũ" },
  { value: "Laptop", label: "Laptop", description: "Máy tính xách tay, ultrabook, gaming laptop" },
  { value: "Máy ảnh", label: "Máy ảnh", description: "Máy ảnh DSLR, mirrorless, ống kính" },
  { value: "Thời trang", label: "Thời trang", description: "Quần áo, giày dép, túi xách, phụ kiện" },
  { value: "Sưu tầm", label: "Sưu tầm", description: "Tem, tiền cổ, đồ sưu tầm, đồ hiếm" },
  { value: "Đồ cổ", label: "Đồ cổ", description: "Đồ cổ, đồ xưa, đồ antiques" },
  { value: "Đồ điện tử", label: "Đồ điện tử", description: "Máy móc, thiết bị điện tử" },
  { value: "Xe cộ", label: "Xe cộ", description: "Xe máy, ô tô, xe đạp" },
  { value: "Khác", label: "Khác", description: "Các món đồ không thuộc danh mục trên" },
];

const CONDITION_OPTIONS = [
  { value: "Mới", label: "Mới", description: "Sản phẩm mới chưa qua sử dụng, còn tem nhãn" },
  { value: "Như mới", label: "Như mới", description: "Đã mở hộp nhưng không sử dụng, còn nguyên vẹn" },
  { value: "Đã sử dụng - tốt", label: "Đã sử dụng - tốt", description: "Đã qua sử dụng nhưng còn tốt, hoạt động ổn định" },
  { value: "Đã sử dụng - có dấu hiệu", label: "Đã sử dụng - có dấu hiệu", description: "Có vết xước nhẹ, trầy nhẹ do sử dụng" },
  { value: "Cần sửa chữa", label: "Cần sửa chữa", description: "Hỏng hóc nhẹ hoặc cần bảo dưỡng" },
];

const DURATION_OPTIONS = [
  { value: 15, label: "15 phút" },
  { value: 30, label: "30 phút" },
  { value: 60, label: "1 giờ" },
  { value: 360, label: "6 giờ" },
  { value: 1440, label: "1 ngày" },
  { value: 4320, label: "3 ngày" },
  { value: 10080, label: "7 ngày" },
];

const STORAGE_KEY = "auction-form-draft";

export function NewAuctionClient() {
  const router = useRouter();
  const { isOnline } = useNetworkStatus();
  const [isAuthenticated, setIsAuthenticated] = useState<boolean | null>(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const [title, setTitle] = useState("");
  const [category, setCategory] = useState("");
  const [condition, setCondition] = useState("");
  const [description, setDescription] = useState("");
  const [imageUrls, setImageUrls] = useState<string[]>([""]);
  const [startPrice, setStartPrice] = useState<string>("");
  const [bidStep, setBidStep] = useState<string>("");
  const [duration, setDuration] = useState<string>("15");
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [termsAccepted, setTermsAccepted] = useState(false);

  const [titleError, setTitleError] = useState<string | null>(null);
  const [categoryError, setCategoryError] = useState<string | null>(null);
  const [conditionError, setConditionError] = useState<string | null>(null);
  const [descriptionError, setDescriptionError] = useState<string | null>(null);
  const [startPriceError, setStartPriceError] = useState<string | null>(null);
  const [bidStepError, setBidStepError] = useState<string | null>(null);
  const [durationError, setDurationError] = useState<string | null>(null);
  const [imageError, setImageError] = useState<string | null>(null);

  const parsedStartPrice = Number(startPrice) || 0;
  const parsedBidStep = Number(bidStep) || 0;
  const parsedDuration = Number(duration) || 15;
  const estimatedEnd = new Date(Date.now() + parsedDuration * 60 * 1000);

  useEffect(() => {
    const loadDraft = () => {
      try {
        const saved = localStorage.getItem(STORAGE_KEY);
        if (saved) {
          const draft = JSON.parse(saved);
          if (draft.title) setTitle(draft.title);
          if (draft.category) setCategory(draft.category);
          if (draft.condition) setCondition(draft.condition);
          if (draft.description) setDescription(draft.description);
          if (draft.startPrice) setStartPrice(draft.startPrice);
          if (draft.bidStep) setBidStep(draft.bidStep);
          if (draft.duration) setDuration(draft.duration);
          if (draft.imageUrls) setImageUrls(draft.imageUrls);
        }
      } catch {
        // Ignore localStorage errors
      }
    };
    loadDraft();
  }, []);

  useEffect(() => {
    try {
      const draft = {
        title,
        category,
        condition,
        description,
        startPrice,
        bidStep,
        duration,
        imageUrls,
      };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(draft));
    } catch {
      // Ignore localStorage errors
    }
  }, [title, category, condition, description, startPrice, bidStep, duration, imageUrls]);

  useEffect(() => {
    const checkAuth = async () => {
      try {
        const res = await fetch("/api/auth/session");
        if (!res.ok) {
          setIsAuthenticated(false);
          return;
        }
        const data = await res.json();
        if (!data?.user) {
          setIsAuthenticated(false);
        }
      } catch {
        setIsAuthenticated(false);
      }
    };
    checkAuth();
  }, []);

  const validateField = (field: string, value: any): string | null => {
    switch (field) {
      case "title":
        if (!value || value.trim().length < 5) return "Tên sản phẩm phải có ít nhất 5 ký tự.";
        if (value.trim().length > 100) return "Tên sản phẩm không được quá 100 ký tự.";
        return null;
      case "category":
        return value ? null : "Vui lòng chọn danh mục sản phẩm.";
      case "condition":
        return value ? null : "Vui lòng chọn tình trạng sản phẩm.";
      case "description":
        if (!value || value.trim().length < 20) return "Mô tả phải có ít nhất 20 ký tự.";
        if (value.trim().length > 2000) return "Mô tả không được quá 2000 ký tự.";
        return null;
      case "startPrice":
        if (!value || Number(value) < 1000) return "Giá khởi điểm tối thiểu 1.000 VND.";
        if (Number(value) > 1000000000) return "Giá khởi điểm tối đa 1 tỷ VND.";
        return null;
      case "bidStep":
        if (!value || Number(value) < 10000) return "Bước giá tối thiểu 10.000 VND.";
        return null;
      case "duration":
        if (!value || Number(value) < 5) return "Thời gian tối thiểu 5 phút.";
        if (Number(value) > 10080) return "Thời gian tối đa 7 ngày.";
        return null;
      default:
        return null;
    }
  };

  const validateAll = () => {
    const errors = {
      title: validateField("title", title),
      category: validateField("category", category),
      condition: validateField("condition", condition),
      description: validateField("description", description),
      startPrice: validateField("startPrice", startPrice),
      bidStep: validateField("bidStep", bidStep),
      duration: validateField("duration", duration),
    };
    setTitleError(errors.title);
    setCategoryError(errors.category);
    setConditionError(errors.condition);
    setDescriptionError(errors.description);
    setStartPriceError(errors.startPrice);
    setBidStepError(errors.bidStep);
    setDurationError(errors.duration);
    return !Object.values(errors).some(Boolean);
  };

  const handleTitleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const v = e.target.value;
    setTitle(v);
    if (titleError) setTitleError(validateField("title", v));
  };

  const handleCategoryChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const v = e.target.value;
    setCategory(v);
    if (categoryError) setCategoryError(validateField("category", v));
  };

  const handleConditionChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const v = e.target.value;
    setCondition(v);
    if (conditionError) setConditionError(validateField("condition", v));
  };

  const handleDescriptionChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const v = e.target.value;
    setDescription(v);
    if (descriptionError) setDescriptionError(validateField("description", v));
  };

  const handleStartPriceChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value.replace(/\D/g, "");
    setStartPrice(raw);
    if (startPriceError) setStartPriceError(validateField("startPrice", raw));
  };

  const handleBidStepChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value.replace(/\D/g, "");
    setBidStep(raw);
    if (bidStepError) setBidStepError(validateField("bidStep", raw));
  };

  const handleDurationChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const v = e.target.value;
    setDuration(v);
    if (durationError) setDurationError(validateField("duration", v));
  };

  const handleImageChange = (index: number, value: string) => {
    const updated = [...imageUrls];
    updated[index] = value;
    setImageUrls(updated);
    if (imageError) setImageError(null);
  };

  const addImageField = () => {
    if (imageUrls.length < 5) {
      setImageUrls([...imageUrls, ""]);
    }
  };

  const removeImageField = (index: number) => {
    if (imageUrls.length > 1) {
      setImageUrls(imageUrls.filter((_, i) => i !== index));
    }
  };

  const isValidImageUrl = (url: string) => {
    return url && /^https?:\/\/.+\.(jpe?g|png|webp|gif|bmp)(\?.*)?$/i.test(url.trim());
  };

  const isFormValid = !Object.values({
    title: validateField("title", title),
    category: validateField("category", category),
    condition: validateField("condition", condition),
    description: validateField("description", description),
    startPrice: validateField("startPrice", startPrice),
    bidStep: validateField("bidStep", bidStep),
    duration: validateField("duration", duration),
  }).some(Boolean);

  const confirmSubmit = async () => {
    setSubmitting(true);
    setError(null);
    try {
      const result = await createAuction({
        title: title.trim(),
        description: description.trim(),
        category,
        condition,
        images: imageUrls.filter((u) => u.trim()),
        startPrice: parsedStartPrice,
        bidStep: parsedBidStep,
        duration: parsedDuration,
        autoExtensionEnabled: true,
        maxExtensions: 3,
      });
      if (result.success) {
        setSuccessMessage("Phiên đấu giá đã được tạo thành công!");
        localStorage.removeItem(STORAGE_KEY);
        setTimeout(() => {
          router.push(`/auctions/${result.data.auctionId}`);
        }, 1000);
      } else {
        setError(result.message || "Không thể tạo phiên đấu giá. Vui lòng thử lại.");
      }
    } catch (err) {
      setError("Đã xảy ra lỗi. Vui lòng thử lại sau.");
    } finally {
      setSubmitting(false);
      setConfirmOpen(false);
    }
  };

  return (
    <div className="min-h-screen relative">
      {/* Background gradients */}
      <div className="fixed inset-0 pointer-events-none">
        <div className="absolute top-0 left-1/4 w-96 h-96 bg-amber-500/10 rounded-full blur-[120px]" />
        <div className="absolute bottom-0 right-1/4 w-80 h-80 bg-emerald-500/8 rounded-full blur-[100px]" />
      </div>

      {/* Page Header */}
      <div className="relative mb-8">
        <div className="bg-gradient-to-br from-neutral-900 via-zinc-900 to-black rounded-2xl border border-white/5 p-6 md:p-8 overflow-hidden">
          <div className="absolute top-0 right-0 w-64 h-64 bg-amber-500/5 rounded-full blur-[80px]" />
          <div className="relative">
            <Button
              type="button"
              variant="ghost"
              asChild
              className="mb-4 text-white/60 hover:text-white hover:bg-white/5"
            >
              <a href="/auctions" className="flex items-center gap-1">
                <ArrowLeft className="h-4 w-4" />
                Quay lại danh sách
              </a>
            </Button>

            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
              <div>
                <h1 className="text-3xl md:text-4xl font-bold text-white tracking-tight">
                  <span className="bg-gradient-to-r from-amber-200 via-amber-400 to-orange-400 bg-clip-text text-transparent">
                    Tạo phiên đấu giá
                  </span>
                </h1>
                <p className="text-neutral-400 mt-2 max-w-xl">
                  Điền thông tin sản phẩm và thiết lập phiên đấu giá chuyên nghiệp. 
                  Sản phẩm của bạn sẽ tiếp cận hàng nghìn người mua tiềm năng.
                </p>
              </div>
              <div className="flex items-center gap-2 text-xs text-neutral-500 bg-white/5 rounded-full px-4 py-2 border border-white/5">
                <Sparkles className="h-3.5 w-3.5 text-amber-400" />
                <span>Miễn phí đăng phiên</span>
              </div>
              <Button asChild variant="outline" className="gap-2 border-white/10 bg-white/5 text-neutral-200 hover:bg-white/10 hover:text-white">
                <Link href="/inventory">
                  <Boxes className="h-4 w-4" />
                  Kho của tôi
                </Link>
              </Button>
            </div>
          </div>
        </div>
      </div>

      {!isOnline && (
        <Alert className="mb-6 border-amber-500/30 bg-amber-500/10 text-amber-200">
          <WifiOff className="h-5 w-5" />
          <AlertDescription>
            Mất kết nối. Dữ liệu form đang được giữ trên trình duyệt. Khi có mạng trở lại, vui lòng tự bấm submit lại.
          </AlertDescription>
        </Alert>
      )}

      <div className="grid gap-6 lg:grid-cols-12">
        {/* Left column - Form */}
        <div className="lg:col-span-7 space-y-6">
          {/* Product Info Section */}
          <Card className="bg-white/5 border-white/10 backdrop-blur-xl shadow-xl">
            <CardHeader className="border-b border-white/5">
              <CardTitle className="text-lg text-white flex items-center gap-2">
                <Tag className="h-4 w-4 text-amber-400" />
                Thông tin sản phẩm
              </CardTitle>
              <CardDescription className="text-neutral-400">
                Nhập thông tin chi tiết về sản phẩm bạn muốn đấu giá.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-5">
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label htmlFor="title" className="text-neutral-200">Tên sản phẩm *</Label>
                  <span className="text-xs text-neutral-500">{title.length}/100</span>
                </div>
                <Input
                  id="title"
                  name="title"
                  value={title}
                  onChange={handleTitleChange}
                  placeholder="VD: Đồng hồ Rolex Submariner - Mới 99%"
                  maxLength={100}
                  className={`w-full bg-white/5 border-white/10 text-white placeholder:text-neutral-600 focus:border-amber-500/50 focus:ring-amber-500/20 ${titleError ? "border-red-500/50 focus-visible:ring-red-500/30" : ""}`}
                />
                {titleError && (
                  <p className="text-xs text-red-400 flex items-center gap-1">
                    <AlertCircle className="h-3 w-3" /> {titleError}
                  </p>
                )}
                <p className="text-xs text-neutral-500">
                  Từ 5 đến 100 ký tự. Tốt nhất nên có thương hiệu + model + tình trạng.
                </p>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="category" className="text-neutral-200">Danh mục *</Label>
                  <div className="relative">
                    <select
                      id="category"
                      name="category"
                      value={category}
                      onChange={handleCategoryChange}
                      className={`h-9 w-full rounded-md border bg-white/5 text-white px-3 py-2 text-sm shadow-xs outline-none focus-visible:border-amber-500/50 focus-visible:ring-amber-500/20 ${
                        categoryError ? "border-red-500/50" : "border-white/10"
                      }`}
                    >
                      <option value="" className="bg-zinc-900">Chọn danh mục</option>
                      {CATEGORY_OPTIONS.map((cat) => (
                        <option key={cat.value} value={cat.value} className="bg-zinc-900">
                          {cat.label}
                        </option>
                      ))}
                    </select>
                    <ChevronRight className="absolute right-3 top-2.5 h-4 w-4 rotate-90 text-neutral-500 pointer-events-none" />
                  </div>
                  {categoryError && (
                    <p className="text-xs text-red-400 flex items-center gap-1">
                      <AlertCircle className="h-3 w-3" /> {categoryError}
                    </p>
                  )}
                  {category && (
                    <p className="text-xs text-neutral-500">
                      {CATEGORY_OPTIONS.find((c) => c.value === category)?.description}
                    </p>
                  )}
                </div>

                <div className="space-y-2">
                  <Label htmlFor="condition" className="text-neutral-200">Tình trạng *</Label>
                  <div className="relative">
                    <select
                      id="condition"
                      name="condition"
                      value={condition}
                      onChange={handleConditionChange}
                      className={`h-9 w-full rounded-md border bg-white/5 text-white px-3 py-2 text-sm shadow-xs outline-none focus-visible:border-amber-500/50 focus-visible:ring-amber-500/20 ${
                        conditionError ? "border-red-500/50" : "border-white/10"
                      }`}
                    >
                      <option value="" className="bg-zinc-900">Chọn tình trạng</option>
                      {CONDITION_OPTIONS.map((cond) => (
                        <option key={cond.value} value={cond.value} className="bg-zinc-900">
                          {cond.label}
                        </option>
                      ))}
                    </select>
                    <ChevronRight className="absolute right-3 top-2.5 h-4 w-4 rotate-90 text-neutral-500 pointer-events-none" />
                  </div>
                  {conditionError && (
                    <p className="text-xs text-red-400 flex items-center gap-1">
                      <AlertCircle className="h-3 w-3" /> {conditionError}
                    </p>
                  )}
                  {condition && (
                    <p className="text-xs text-neutral-500">
                      {CONDITION_OPTIONS.find((c) => c.value === condition)?.description}
                    </p>
                  )}
                </div>
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label htmlFor="description" className="text-neutral-200">Mô tả chi tiết *</Label>
                  <span className="text-xs text-neutral-500">{description.length}/2000</span>
                </div>
                <div className="relative">
                  <Textarea
                    id="description"
                    name="description"
                    value={description}
                    onChange={handleDescriptionChange}
                    placeholder={`Ví dụ:\n- Nguồn gốc sản phẩm:\n- Tình trạng hiện tại:\n- Phụ kiện đi kèm:\n- Chính sách giao nhận:\n- Lưu ý cho người mua:`}
                    className={`min-h-32 resize-y bg-white/5 border-white/10 text-white placeholder:text-neutral-600 focus:border-amber-500/50 focus:ring-amber-500/20 ${descriptionError ? "border-red-500/50 focus-visible:ring-red-500/30" : ""}`}
                    maxLength={2000}
                  />
                  <div className="absolute bottom-3 right-3 flex gap-2">
                    <Badge variant="outline" className="text-xs border-white/10 text-neutral-400">
                      Gợi ý: Viết chi tiết để thu hút người mua
                    </Badge>
                  </div>
                </div>
                {descriptionError && (
                  <p className="text-xs text-red-400 flex items-center gap-1">
                    <AlertCircle className="h-3 w-3" /> {descriptionError}
                  </p>
                )}
                <p className="text-xs text-neutral-500">
                  Tối thiểu 20 ký tự. Mô tả chi tiết giúp tăng độ tin cậy và thu hút người mua.
                </p>
              </div>
            </CardContent>
          </Card>

          {/* Images Section */}
          <Card className="bg-white/5 border-white/10 backdrop-blur-xl shadow-xl">
            <CardHeader className="border-b border-white/5">
              <CardTitle className="text-lg text-white flex items-center gap-2">
                <ImageIcon className="h-4 w-4 text-amber-400" />
                Hình ảnh sản phẩm
              </CardTitle>
              <CardDescription className="text-neutral-400">Tối đa 5 ảnh. Ảnh đầu tiên sẽ là thumbnail.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                {imageUrls.map((url, index) => (
                  <div key={index} className="flex items-center gap-3 group">
                    <div className="flex-1 relative">
                      <Input
                        id={`image-${index}`}
                        name="imageUrls"
                        value={url}
                        onChange={(e) => handleImageChange(index, e.target.value)}
                        type="url"
                        placeholder={`https://example.com/image${index + 1}.jpg`}
                        className="w-full bg-white/5 border-white/10 text-white placeholder:text-neutral-600 focus:border-amber-500/50 focus:ring-amber-500/20"
                      />
                      {url && isValidImageUrl(url) && (
                        <div className="absolute right-2 top-1/2 -translate-y-1/2">
                          <div className="h-8 w-8 rounded bg-white/10 flex items-center justify-center overflow-hidden border border-white/10">
                            <img src={url} alt={`Preview ${index}`} className="h-full w-full object-cover" onError={(e) => (e.currentTarget.style.display = "none")} />
                          </div>
                        </div>
                      )}
                    </div>
                    {imageUrls.length > 1 && (
                      <Button type="button" variant="ghost" size="sm" onClick={() => removeImageField(index)} className="h-9 w-9 p-0 text-neutral-400 hover:text-white hover:bg-white/10">
                        <X className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                ))}
                {imageUrls.length < 5 && (
                  <Button type="button" variant="outline" size="sm" onClick={addImageField} className="w-full border-white/10 text-neutral-300 hover:text-white hover:bg-white/10 hover:border-white/20">
                    <ImageIcon className="mr-2 h-4 w-4" />
                    Thêm ảnh
                  </Button>
                )}
              </div>
              <div className="flex flex-wrap gap-2">
                {imageUrls.map((url, index) =>
                  url && isValidImageUrl(url) ? (
                    <Badge key={index} variant="secondary" className="text-xs bg-white/5 text-neutral-300 border-white/10">
                      Ảnh {index + 1}
                    </Badge>
                  ) : null
                )}
              </div>
              <p className="text-xs text-neutral-500">
                Hỗ trợ URL ảnh từ JPEG, PNG, WebP. Ảnh đầu tiên sẽ làm thumbnail.
              </p>
            </CardContent>
          </Card>

          {/* Pricing Section */}
          <Card className="bg-white/5 border-white/10 backdrop-blur-xl shadow-xl">
            <CardHeader className="border-b border-white/5">
              <CardTitle className="text-lg text-white flex items-center gap-2">
                <span className="text-emerald-400">💰</span>
                Cài đặt giá
              </CardTitle>
              <CardDescription className="text-neutral-400">Giá khởi điểm và bước giá tối thiểu.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-5">
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="startPrice" className="text-neutral-200">Giá khởi điểm (VND) *</Label>
                  <div className="relative">
                    <Input
                      id="startPrice"
                      name="startPrice"
                      type="number"
                      value={startPrice}
                      onChange={handleStartPriceChange}
                      placeholder="1000000"
                      min={1000}
                      step={1000}
                      className={`pl-12 bg-white/5 border-white/10 text-white placeholder:text-neutral-600 focus:border-amber-500/50 focus:ring-amber-500/20 ${startPriceError ? "border-red-500/50 focus-visible:ring-red-500/30" : ""}`}
                    />
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-500">₫</span>
                  </div>
                  <p className="text-xs text-neutral-500">
                    {parsedStartPrice > 0 ? formatCurrency(parsedStartPrice) : "Ví dụ: 1.000.000 VND"}
                  </p>
                  {startPriceError && (
                    <p className="text-xs text-red-400 flex items-center gap-1">
                      <AlertCircle className="h-3 w-3" /> {startPriceError}
                    </p>
                  )}
                </div>

                <div className="space-y-2">
                  <Label htmlFor="bidStep" className="text-neutral-200">Bước giá tối thiểu (VND) *</Label>
                  <div className="relative">
                    <Input
                      id="bidStep"
                      name="bidStep"
                      type="number"
                      value={bidStep}
                      onChange={handleBidStepChange}
                      placeholder="10000"
                      min={10000}
                      step={1000}
                      className={`pl-12 bg-white/5 border-white/10 text-white placeholder:text-neutral-600 focus:border-amber-500/50 focus:ring-amber-500/20 ${bidStepError ? "border-red-500/50 focus-visible:ring-red-500/30" : ""}`}
                    />
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-500">₫</span>
                  </div>
                  <p className="text-xs text-neutral-500">
                    {parsedBidStep > 0 ? formatCurrency(parsedBidStep) : "Ví dụ: 10.000 VND"}
                  </p>
                  {bidStepError && (
                    <p className="text-xs text-red-400 flex items-center gap-1">
                      <AlertCircle className="h-3 w-3" /> {bidStepError}
                    </p>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Duration Section */}
          <Card className="bg-white/5 border-white/10 backdrop-blur-xl shadow-xl">
            <CardHeader className="border-b border-white/5">
              <CardTitle className="text-lg text-white flex items-center gap-2">
                <Clock className="h-4 w-4 text-amber-400" />
                Thời gian đấu giá
              </CardTitle>
              <CardDescription className="text-neutral-400">Chọn thời gian cho phiên đấu giá của bạn.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-3 md:grid-cols-5 gap-2">
                {DURATION_OPTIONS.map((opt) => (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => {
                      setDuration(String(opt.value));
                      setDurationError(validateField("duration", opt.value));
                    }}
                    className={`flex flex-col items-center justify-center rounded-md border px-3 py-2 text-sm transition-all ${
                      duration === String(opt.value)
                        ? "border-amber-500/50 bg-amber-500/10 text-amber-300"
                        : "border-white/10 text-neutral-400 hover:bg-white/5 hover:text-white"
                    }`}
                  >
                    <span>{opt.label}</span>
                  </button>
                ))}
              </div>

              <div className="space-y-2">
                <Label htmlFor="duration" className="text-neutral-200">Tùy chỉnh (phút)</Label>
                <div className="relative">
                  <Input
                    id="duration"
                    name="duration"
                    type="number"
                    value={duration}
                    onChange={handleDurationChange}
                    min={5}
                    max={10080}
                    className="pl-12 bg-white/5 border-white/10 text-white placeholder:text-neutral-600 focus:border-amber-500/50 focus:ring-amber-500/20"
                  />
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-500">min</span>
                </div>
                <p className="text-xs text-neutral-500">
                  {parsedDuration > 0 && parsedDuration >= 5 && parsedDuration <= 10080
                    ? `Thời gian: ${Math.floor(parsedDuration / 60)}h ${parsedDuration % 60}p (${parsedDuration} phút)`
                    : "Tối thiểu 5 phút, tối đa 7 ngày (10,080 phút)"}
                </p>
              </div>

              <div className="rounded-md bg-amber-500/10 border border-amber-500/20 p-3 flex items-start gap-2">
                <Calendar className="h-4 w-4 text-amber-400 mt-0.5 flex-shrink-0" />
                <div className="text-xs text-amber-200">
                  <strong>Dự kiến kết thúc:</strong> {estimatedEnd.toLocaleString("vi-VN")}
                </div>
              </div>
              {durationError && (
                <p className="text-xs text-red-400 flex items-center gap-1">
                  <AlertCircle className="h-3 w-3" /> {durationError}
                </p>
              )}
            </CardContent>
          </Card>

          {/* Terms and Submit */}
          <Card className="bg-white/5 border-white/10 backdrop-blur-xl shadow-xl">
            <CardContent className="space-y-4 pt-6">
              <div className="flex items-start gap-3">
                <input
                  id="terms"
                  type="checkbox"
                  checked={termsAccepted}
                  onChange={(e) => setTermsAccepted(e.target.checked)}
                  className="mt-1 h-4 w-4 rounded border-white/20 bg-white/5 text-amber-500 focus:ring-amber-500/30"
                />
                <div className="space-y-1">
                  <label htmlFor="terms" className="text-sm font-medium text-neutral-200 leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70">
                    Tôi xác nhận thông tin sản phẩm là chính xác và đồng ý không chỉnh sửa sau khi có người đặt giá.
                  </label>
                  <p className="text-xs text-neutral-500">
                    Lưu ý: Sau khi phiên đấu giá có bid, bạn không nên thay đổi thông tin sản phẩm để đảm bảo tính minh bạch.
                  </p>
                </div>
              </div>

              {error && (
                <Alert variant="destructive" className="bg-red-500/10 border-red-500/30 text-red-200">
                  <AlertCircle className="h-5 w-5" />
                  <AlertDescription>{error}</AlertDescription>
                </Alert>
              )}

              <div className="flex flex-col sm:flex-row gap-3">
                <Button
                  type="button"
                  variant="outline"
                  asChild
                  className="flex-1 border-white/10 text-neutral-300 hover:text-white hover:bg-white/10 hover:border-white/20"
                >
                  <a href="/auctions">
                    Hủy
                  </a>
                </Button>
                <Button
                  type="button"
                  onClick={() => {
                    setError(null);
                    if (!isOnline) {
                      setError("Không thể kết nối máy chủ. Vui lòng kiểm tra mạng và thử lại.");
                      return;
                    }
                    if (!isFormValid) {
                      setError("Vui lòng kiểm tra lại thông tin form");
                      return;
                    }
                    if (!termsAccepted) {
                      setError("Bạn cần đồng ý với các điều khoản trước khi tạo phiên đấu giá");
                      return;
                    }
                    setConfirmOpen(true);
                  }}
                  disabled={!isFormValid || submitting || !termsAccepted || !isOnline}
                  className="flex-1 bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-400 hover:to-orange-400 text-white shadow-lg shadow-amber-500/20 hover:shadow-amber-500/30 disabled:opacity-50 disabled:shadow-none"
                >
                  {submitting ? (
                    <span className="flex items-center gap-2">
                      <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                      </svg>
                      Đang tạo...
                    </span>
                  ) : "Tạo phiên đấu giá"}
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Right column - Preview */}
        <div className="lg:col-span-5 space-y-6">
          <div className="sticky top-6">
            {/* Preview Card */}
            <div className="bg-gradient-to-br from-zinc-900 via-zinc-800/90 to-black rounded-2xl border border-white/10 overflow-hidden shadow-2xl shadow-black/40">
              {/* Preview Header */}
              <div className="bg-gradient-to-r from-zinc-800 to-zinc-900 border-b border-white/5 p-4">
                <div className="flex items-center justify-between mb-1">
                  <h2 className="text-lg font-semibold text-white">Preview</h2>
                  <Badge variant="outline" className="border-amber-500/30 text-amber-300 bg-amber-500/5 text-xs">
                    <Sparkles className="h-3 w-3 mr-1" />
                    Live Preview
                  </Badge>
                </div>
                <p className="text-xs text-neutral-500">
                  Sản phẩm của bạn sẽ hiển thị như này sau khi tạo.
                </p>
              </div>

              <div className="p-4 space-y-4">
                {/* Image Preview */}
                <div className="aspect-[4/3] w-full rounded-xl bg-gradient-to-br from-zinc-800 to-neutral-900 overflow-hidden flex items-center justify-center border border-white/5">
                  {imageUrls[0] && isValidImageUrl(imageUrls[0]) ? (
                    <img src={imageUrls[0]} alt={title || "Sản phẩm"} className="h-full w-full object-cover" />
                  ) : (
                    <div className="text-center p-4">
                      <div className="w-16 h-16 mx-auto mb-3 rounded-full bg-white/5 flex items-center justify-center">
                        <ImageIcon className="h-8 w-8 text-neutral-600" />
                      </div>
                      <p className="text-sm text-neutral-500">Ảnh preview</p>
                      <p className="text-xs text-neutral-600 mt-1">Thêm URL ảnh để xem trước</p>
                    </div>
                  )}
                  {/* Status badge overlay */}
                  <div className="absolute top-6 left-6">
                    <Badge className="bg-emerald-500/90 text-white border-none text-xs shadow-lg shadow-emerald-500/20">
                      <span className="flex items-center gap-1">
                        <span className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" />
                        Sẽ mở ngay khi tạo
                      </span>
                    </Badge>
                  </div>
                  {/* Image count badge */}
                  {imageUrls.filter(u => u.trim()).length > 0 && (
                    <div className="absolute top-6 right-6">
                      <Badge variant="outline" className="border-white/20 bg-black/50 text-white text-xs backdrop-blur-sm">
                        <ImageIcon className="h-3 w-3 mr-1" />
                        {imageUrls.filter((u) => u.trim()).length}
                      </Badge>
                    </div>
                  )}
                </div>

                {/* Product Info */}
                <div className="space-y-3">
                  {/* Category & Condition badges */}
                  <div className="flex flex-wrap gap-2">
                    {category && (
                      <Badge className="bg-white/5 text-neutral-300 border-white/10 text-xs">
                        {category}
                      </Badge>
                    )}
                    {condition && (
                      <Badge className="bg-white/5 text-neutral-300 border-white/10 text-xs">
                        {condition}
                      </Badge>
                    )}
                    {!category && !condition && (
                      <span className="text-xs text-neutral-600 italic">Chọn danh mục và tình trạng</span>
                    )}
                  </div>

                  <h3 className="font-semibold text-xl text-white line-clamp-2" title={title}>
                    {title || <span className="text-neutral-600 italic">Tên sản phẩm sẽ hiển thị ở đây...</span>}
                  </h3>

                  {/* Price display */}
                  <div className="space-y-2">
                    <div className="flex items-baseline gap-2">
                      <span className="text-3xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-amber-200 to-orange-400">
                        {parsedStartPrice > 0 ? formatCurrency(parsedStartPrice) : "0 ₫"}
                      </span>
                      <span className="text-sm text-neutral-500">
                        ({formatNumberWithCommas(parsedStartPrice)} VND)
                      </span>
                    </div>

                    <div className="flex items-center gap-2 text-sm text-neutral-400">
                      <ArrowLeft className="h-3.5 w-3.5 rotate-45" />
                      <span>
                        Bước giá: <span className="font-medium text-white">{parsedBidStep > 0 ? formatCurrency(parsedBidStep) : "10.000 ₫"}</span>
                      </span>
                    </div>
                  </div>

                  {/* Duration */}
                  <div className="flex items-center gap-2 text-sm text-neutral-400 bg-white/5 rounded-lg p-3 border border-white/5">
                    <Calendar className="h-4 w-4 text-amber-400" />
                    <span>
                      {parsedDuration >= 5 && parsedDuration <= 10080
                        ? `Kết thúc sau: ${Math.floor(parsedDuration / 60)}h ${parsedDuration % 60}p`
                        : "Thời gian chưa hợp lệ"}
                    </span>
                    <span className="ml-auto text-xs text-neutral-600">
                      {estimatedEnd.toLocaleDateString("vi-VN")}
                    </span>
                  </div>

                  {/* Status */}
                  <div className="flex items-center gap-2">
                    <Badge className="bg-emerald-500/20 text-emerald-300 border-emerald-500/30 text-xs">
                      <CheckCircle className="h-3 w-3 mr-1" />
                      ACTIVE — Sẵn sàng đấu giá
                    </Badge>
                  </div>

                  {/* Description preview */}
                  {description && (
                    <div className="pt-3 border-t border-white/5">
                      <p className="text-sm text-neutral-400 line-clamp-3 leading-relaxed">{description}</p>
                    </div>
                  )}

                  {/* Quick stats */}
                  <div className="grid grid-cols-3 gap-2 pt-3 border-t border-white/5">
                    <div className="text-center p-2 rounded-lg bg-white/5">
                      <div className="text-lg font-bold text-white">{imageUrls.filter((u) => u.trim()).length}</div>
                      <div className="text-xs text-neutral-500">Số ảnh</div>
                    </div>
                    <div className="text-center p-2 rounded-lg bg-white/5">
                      <div className="text-lg font-bold text-white">{parsedBidStep > 0 ? formatCurrency(parsedBidStep).replace("₫", "").trim() : "-"}</div>
                      <div className="text-xs text-neutral-500">Bước giá</div>
                    </div>
                    <div className="text-center p-2 rounded-lg bg-white/5">
                      <div className="text-lg font-bold text-white">{parsedDuration > 0 ? `${parsedDuration}p` : "-"}</div>
                      <div className="text-xs text-neutral-500">Thời gian</div>
                    </div>
                  </div>
                </div>

                {/* Warning note */}
                <div className="bg-amber-500/5 border border-amber-500/10 rounded-xl p-3">
                  <div className="flex items-start gap-2">
                    <Shield className="h-4 w-4 text-amber-400 mt-0.5 flex-shrink-0" />
                    <p className="text-xs text-amber-200/80">
                      <strong>Lưu ý:</strong> Sau khi phiên đấu giá có bid, bạn không nên thay đổi thông tin sản phẩm để đảm bảo tính minh bạch.
                    </p>
                  </div>
                </div>
              </div>

              <div className="flex items-center justify-between px-4 py-3 border-t border-white/5 bg-white/5">
                <div className="text-xs text-neutral-500">
                  Preview cập nhật realtime
                </div>
                <CheckCircle className="h-4 w-4 text-emerald-400" />
              </div>
            </div>

            {successMessage && (
              <Alert className="mt-4 bg-emerald-500/10 border-emerald-500/30">
                <CheckCircle className="h-5 w-5 text-emerald-400" />
                <AlertDescription className="text-emerald-200">
                  {successMessage}
                </AlertDescription>
              </Alert>
            )}
          </div>
        </div>
      </div>

      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent className="bg-zinc-900 border-white/10 text-white">
          <DialogHeader>
            <DialogTitle className="text-xl text-white">Xác nhận tạo phiên đấu giá</DialogTitle>
            <DialogDescription className="text-neutral-400">
              Vui lòng kiểm tra lại thông tin trước khi đăng bán trên AutoBid.vn.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 rounded-xl border border-white/10 bg-white/5 p-4 text-sm">
            <div className="flex justify-between gap-4">
              <span className="text-neutral-400">Tên sản phẩm</span>
              <span className="font-medium text-white text-right">{title}</span>
            </div>
            <div className="flex justify-between gap-4">
              <span className="text-neutral-400">Giá khởi điểm</span>
              <span className="font-medium text-amber-300">{formatCurrency(parsedStartPrice)}</span>
            </div>
            <div className="flex justify-between gap-4">
              <span className="text-neutral-400">Bước giá</span>
              <span className="font-medium text-white">{formatCurrency(parsedBidStep)}</span>
            </div>
            <div className="flex justify-between gap-4">
              <span className="text-neutral-400">Thời gian đấu giá</span>
              <span className="font-medium text-white">{parsedDuration} phút</span>
            </div>
            <div className="flex justify-between gap-4">
              <span className="text-neutral-400">Số ảnh</span>
              <span className="font-medium text-white">{imageUrls.filter((url) => url.trim()).length}</span>
            </div>
          </div>

          <Alert className="bg-amber-500/10 border-amber-500/20">
            <AlertCircle className="h-5 w-5 text-amber-400" />
            <AlertDescription className="text-amber-200">
              Sau khi phiên đấu giá có bid, bạn không nên thay đổi thông tin sản phẩm.
            </AlertDescription>
          </Alert>

          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmOpen(false)} disabled={submitting} className="border-white/10 text-neutral-300 hover:text-white hover:bg-white/10">
              Kiểm tra lại
            </Button>
            <Button onClick={confirmSubmit} disabled={submitting || !isOnline} className="bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-400 hover:to-orange-400 text-white shadow-lg shadow-amber-500/20 disabled:opacity-50 disabled:shadow-none">
              {submitting ? "Đang tạo..." : "Xác nhận tạo"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
