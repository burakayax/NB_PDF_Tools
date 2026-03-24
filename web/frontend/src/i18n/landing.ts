export type Language = "tr" | "en";

type LandingFeature = {
  icon: string;
  title: string;
  benefit: string;
};

type LandingScreenshot = {
  src: string;
  title: string;
  description: string;
};

type LandingPlan = {
  name: string;
  price: string;
  description: string;
  badge?: string;
  features: string[];
  cta: string;
  highlighted?: boolean;
};

type TrustPoint = {
  title: string;
  description: string;
};

type LandingTranslation = {
  navbar: {
    productLabel: string;
    platformTag: string;
    contact: string;
    languageLabel: string;
    login: string;
    register: string;
    openWorkspace: string;
  };
  hero: {
    audience: string[];
    kicker: string;
    headline: string;
    alternatives: string[];
    description: string;
    primaryCta: string;
    secondaryCta: string;
    highlights: Array<{ label: string; value: string }>;
    quickStats: Array<{ title: string; description: string }>;
  };
  features: {
    kicker: string;
    title: string;
    items: LandingFeature[];
  };
  screenshots: {
    kicker: string;
    title: string;
    description: string;
    items: LandingScreenshot[];
    sideCards: Array<{ icon: string; title: string; description: string }>;
  };
  trust: {
    kicker: string;
    title: string;
    description: string;
    points: TrustPoint[];
  };
  pricing: {
    kicker: string;
    title: string;
    description: string;
    plans: LandingPlan[];
  };
  finalCta: {
    kicker: string;
    title: string;
    description: string;
    primaryCta: string;
    secondaryCta: string;
  };
  footer: {
    description: string;
    availability: string;
    security: string;
    contact: string;
  };
  contactSection: {
    kicker: string;
    title: string;
    description: string;
    nameLabel: string;
    emailLabel: string;
    messageLabel: string;
    submit: string;
    submitting: string;
    success: string;
    errorFallback: string;
    validation: {
      nameRequired: string;
      nameTooShort: string;
      emailRequired: string;
      emailInvalid: string;
      messageRequired: string;
      messageTooShort: string;
    };
    honeypotLabel: string;
  };
};

export const landingTranslations: Record<Language, LandingTranslation> = {
  en: {
    navbar: {
      productLabel: "NB PDF TOOLS",
      platformTag: "Professional PDF Workflow Platform",
      contact: "Contact",
      languageLabel: "Language",
      login: "Login",
      register: "Register",
      openWorkspace: "Open Workspace",
    },
    hero: {
      audience: ["Office teams", "Tender departments", "Administrative staff", "Operations leads"],
      kicker: "PDF Management for Business Workflows",
      headline: "All Your PDF Operations. One Professional Tool.",
      alternatives: [
        "Fast, Secure PDF Management for Business Workflows",
        "Handle Your PDFs in Seconds, Built for Professionals",
      ],
      description:
        "NB PDF TOOLS brings conversion, merge, split, compression, and encryption into one professional system so teams move faster, reduce document handling errors, and keep sensitive files under control.",
      primaryCta: "Use Web App",
      secondaryCta: "Download for Windows",
      highlights: [
        { label: "Built for", value: "Business-critical document handling" },
        { label: "Core value", value: "Less manual work, fewer file errors" },
        { label: "Deployment", value: "Web access and Windows desktop control" },
      ],
      quickStats: [
        {
          title: "Fast Processing",
          description: "Streamline repetitive document tasks without breaking workflow quality.",
        },
        {
          title: "Secure Handling",
          description: "Manage protected files with business-focused encryption and control.",
        },
      ],
    },
    features: {
      kicker: "Business Benefits",
      title: "Built around document speed, accuracy, and control.",
      items: [
        {
          icon: "merge",
          title: "Merge PDFs in seconds",
          benefit: "Combine reports, attachments, and document sets into one polished file without manual rework.",
        },
        {
          icon: "split",
          title: "Split large documents instantly",
          benefit: "Extract only the pages you need for procurement packs, internal reviews, and approvals.",
        },
        {
          icon: "convert",
          title: "Convert files without formatting loss",
          benefit: "Move between PDF, Word, and Excel with a workflow built for business-ready output.",
        },
        {
          icon: "secure",
          title: "Secure sensitive documents",
          benefit: "Protect confidential files with encryption and safer handling across daily operations.",
        },
        {
          icon: "compress",
          title: "Reduce file size for faster delivery",
          benefit: "Optimize heavy PDFs before sending them to clients, teams, or submission platforms.",
        },
        {
          icon: "excel",
          title: "Turn tables into working spreadsheets",
          benefit: "Convert PDF-based tabular content into Excel for faster editing, reporting, and verification.",
        },
      ],
    },
    screenshots: {
      kicker: "Product Preview",
      title: "A focused workspace for teams that process documents every day.",
      description:
        "The interface is designed to keep important actions visible, reduce confusion, and support high-volume PDF operations with a clean enterprise-grade layout.",
      items: [
        {
          src: "/app-preview-main.png",
          title: "Unified multi-tool workspace",
          description: "Core PDF operations are grouped in one interface so teams can complete work without switching tools.",
        },
        {
          src: "/app-preview-merge.png",
          title: "Focused processing experience",
          description: "Clean status handling, structured forms, and progress feedback keep large document jobs under control.",
        },
      ],
      sideCards: [
        {
          icon: "shield",
          title: "Operational confidence",
          description: "Keep sensitive files protected while giving teams a dependable document workflow they can use daily.",
        },
        {
          icon: "speed",
          title: "Faster turnaround",
          description: "Replace fragmented document steps with one streamlined system for faster handoffs and fewer mistakes.",
        },
      ],
    },
    trust: {
      kicker: "Why teams trust it",
      title: "Built to reduce busywork and improve document accuracy.",
      description:
        "From office operations to procurement submissions, the platform is designed to shorten document preparation time while keeping outputs organized, secure, and consistent.",
      points: [
        {
          title: "Your documents never leave your system (Windows app)",
          description: "The Windows application processes files locally on the device so sensitive business documents stay under your direct control.",
        },
        {
          title: "Secure processing",
          description: "Document workflows are built with protected handling, access control, and encryption-aware operations for business use.",
        },
        {
          title: "No data retention",
          description: "We do not keep your processed document contents as part of the core workflow, helping teams minimize exposure and handling risk.",
        },
      ],
    },
    pricing: {
      kicker: "Pricing",
      title: "Choose the access level that matches your workflow.",
      description:
        "Start with a lightweight plan, upgrade for unlimited access, or equip multiple team members with a business setup.",
      plans: [
        {
          name: "Free",
          price: "$0",
          description: "For individual evaluation and lightweight daily tasks.",
          features: ["Up to 5 operations per day", "Core PDF tools", "Web access"],
          cta: "Start Free",
        },
        {
          name: "Pro",
          price: "$19/mo",
          description: "For professionals who need unlimited document work.",
          badge: "Most Popular",
          features: ["Unlimited operations", "All premium PDF tools", "Windows desktop access"],
          cta: "Choose Pro",
          highlighted: true,
        },
        {
          name: "Business",
          price: "Custom",
          description: "For teams that need shared access and account control.",
          features: ["Multi-user access", "Centralized billing", "Priority onboarding"],
          cta: "Talk to Sales",
        },
      ],
    },
    finalCta: {
      kicker: "Start with the right format for your team",
      title: "Start using instantly or download for full control.",
      description: "Launch the web version for immediate access, or install the Windows app for a dedicated desktop workflow.",
      primaryCta: "Use Web Version",
      secondaryCta: "Download Windows App",
    },
    footer: {
      description: "Professional PDF management software for business workflows.",
      availability: "Web + Windows availability",
      security: "Secure document operations",
      contact: "Contact",
    },
    contactSection: {
      kicker: "Contact",
      title: "Send a message to our team",
      description: "Tell us what you need and we will get back to you as soon as possible.",
      nameLabel: "Name",
      emailLabel: "Email",
      messageLabel: "Message",
      submit: "Send Message",
      submitting: "Sending...",
      success: "Your message has been sent successfully",
      errorFallback: "Your message could not be sent.",
      validation: {
        nameRequired: "Please enter your name.",
        nameTooShort: "Please enter your name (at least 2 characters).",
        emailRequired: "Please enter your email address.",
        emailInvalid: "Please enter a valid email address.",
        messageRequired: "Please enter your message.",
        messageTooShort: "Please enter a message (at least 10 characters).",
      },
      honeypotLabel: "Leave this field empty",
    },
  },
  tr: {
    navbar: {
      productLabel: "NB PDF TOOLS",
      platformTag: "Profesyonel PDF İş Akışı Platformu",
      contact: "İletişim",
      languageLabel: "Dil",
      login: "Giriş Yap",
      register: "Kayıt Ol",
      openWorkspace: "Çalışma Alanını Aç",
    },
    hero: {
      audience: ["Ofis ekipleri", "İhale birimleri", "İdari personel", "Operasyon yöneticileri"],
      kicker: "İş Süreçleri İçin PDF Yönetimi",
      headline: "Tüm PDF İşlemleriniz. Tek Bir Profesyonel Araç.",
      alternatives: [
        "İş Süreçleri İçin Hızlı ve Güvenli PDF Yönetimi",
        "PDF İşlemlerinizi Saniyeler İçinde Yönetin, Profesyoneller İçin Tasarlandı",
      ],
      description:
        "NB PDF TOOLS; dönüştürme, birleştirme, ayırma, sıkıştırma ve şifreleme işlemlerini tek bir profesyonel sistemde toplar. Ekipler daha hızlı çalışır, manuel iş yükünü azaltır ve belge hatalarını en aza indirir.",
      primaryCta: "Web Sürümünü Kullan",
      secondaryCta: "Windows İçin İndir",
      highlights: [
        { label: "Tasarlanan kullanım", value: "İş açısından kritik belge yönetimi" },
        { label: "Ana fayda", value: "Daha az manuel iş, daha az belge hatası" },
        { label: "Erişim modeli", value: "Web erişimi ve Windows masaüstü kontrolü" },
      ],
      quickStats: [
        {
          title: "Hızlı İşlem",
          description: "Tekrarlayan belge işlemlerini iş kalitesini bozmadan hızlandırın.",
        },
        {
          title: "Güvenli Kullanım",
          description: "Korumalı dosyaları iş odaklı şifreleme ve kontrol ile yönetin.",
        },
      ],
    },
    features: {
      kicker: "İş Faydası",
      title: "Hız, doğruluk ve kontrol odaklı belge yönetimi.",
      items: [
        {
          icon: "merge",
          title: "PDF dosyalarını saniyeler içinde birleştirin",
          benefit: "Raporları, ekleri ve belge setlerini manuel düzenleme yapmadan tek dosyada toplayın.",
        },
        {
          icon: "split",
          title: "Büyük dosyaları anında ayırın",
          benefit: "İhale paketleri, iç incelemeler ve onay süreçleri için sadece gerekli sayfaları alın.",
        },
        {
          icon: "convert",
          title: "Dosyaları düzeni koruyarak dönüştürün",
          benefit: "PDF, Word ve Excel arasında iş kullanımına uygun çıktılarla geçiş yapın.",
        },
        {
          icon: "secure",
          title: "Hassas belgeleri koruyun",
          benefit: "Gizli dosyaları şifreleme ve daha güvenli belge akışları ile koruma altına alın.",
        },
        {
          icon: "compress",
          title: "Dosya boyutlarını düşürün",
          benefit: "Ağır PDF dosyalarını göndermeden önce optimize ederek paylaşımı hızlandırın.",
        },
        {
          icon: "excel",
          title: "Tabloları çalışılır Excel dosyalarına çevirin",
          benefit: "PDF içindeki tablo verilerini düzenleme, raporlama ve kontrol için Excel'e aktarın.",
        },
      ],
    },
    screenshots: {
      kicker: "Ürün Önizlemesi",
      title: "Her gün belge işleyen ekipler için odaklı bir çalışma alanı.",
      description:
        "Arayüz; önemli işlemleri görünür tutmak, karışıklığı azaltmak ve yüksek hacimli PDF operasyonlarını kurumsal düzende yönetmek için tasarlandı.",
      items: [
        {
          src: "/app-preview-main.png",
          title: "Tüm araçlar tek çalışma alanında",
          description: "Temel PDF işlemleri tek ekranda bir araya gelir, ekipler farklı araçlar arasında geçiş yapmaz.",
        },
        {
          src: "/app-preview-merge.png",
          title: "Odaklı işlem deneyimi",
          description: "Temiz durum yönetimi, düzenli formlar ve ilerleme görünümü büyük belge işlerini kontrol altında tutar.",
        },
      ],
      sideCards: [
        {
          icon: "shield",
          title: "Operasyonel güven",
          description: "Hassas dosyaları korurken ekiplerin her gün kullanabileceği güvenilir bir belge akışı sunun.",
        },
        {
          icon: "speed",
          title: "Daha hızlı tamamlanma",
          description: "Parçalanmış belge adımlarını tek sistemde toplayarak teslim sürelerini kısaltın.",
        },
      ],
    },
    trust: {
      kicker: "Ekipler neden güveniyor",
      title: "Yoğun belge operasyonlarını kolaylaştırmak için tasarlandı.",
      description:
        "Ofis operasyonlarından ihale hazırlığına kadar, platform belge hazırlama süresini kısaltırken çıktıların düzenli, güvenli ve tutarlı kalmasına yardımcı olur.",
      points: [
        {
          title: "Belgeleriniz sisteminizden cikmaz (Windows uygulamasi)",
          description: "Windows uygulamasi dosyalari cihaz uzerinde yerel olarak isler; boylece hassas is belgeleri dogrudan sizin kontrolunuzde kalir.",
        },
        {
          title: "Guvenli isleme",
          description: "Belge akislarinda korumali isleme, erisim kontrolu ve sifre farkindaligi ile kurumsal kullanim odakli bir yapi sunulur.",
        },
        {
          title: "Veri saklama yok",
          description: "Temel is akisi kapsaminda islenen belge iceriklerini saklamayarak ekiplerin maruziyetini ve veri isleme riskini azaltmaya yardimci oluruz.",
        },
      ],
    },
    pricing: {
      kicker: "Fiyatlandırma",
      title: "Çalışma düzeninize uygun erişim seviyesini seçin.",
      description:
        "Temel kullanımla başlayın, limitsiz erişim için yükselin veya ekibiniz için çok kullanıcılı bir iş yapısı kurun.",
      plans: [
        {
          name: "Ücretsiz",
          price: "$0",
          description: "Bireysel deneme ve hafif günlük kullanım için.",
          features: ["Günde 5 işleme kadar", "Temel PDF araçları", "Web erişimi"],
          cta: "Ücretsiz Başla",
        },
        {
          name: "Pro",
          price: "$19/ay",
          description: "Limitsiz belge işlemi ihtiyacı olan profesyoneller için.",
          badge: "En Çok Tercih Edilen",
          features: ["Limitsiz işlem", "Tüm premium PDF araçları", "Windows masaüstü erişimi"],
          cta: "Pro'yu Seç",
          highlighted: true,
        },
        {
          name: "Business",
          price: "Özel",
          description: "Paylaşımlı kullanım ve hesap yönetimi gereken ekipler için.",
          features: ["Çok kullanıcılı erişim", "Merkezi faturalandırma", "Öncelikli kurulum desteği"],
          cta: "Satış ile Görüş",
        },
      ],
    },
    finalCta: {
      kicker: "Ekibiniz için doğru kullanım modelini seçin",
      title: "Hemen kullanmaya başlayın veya tam kontrol için indirin.",
      description: "Anında erişim için web sürümünü açın ya da ayrılmış masaüstü deneyimi için Windows sürümünü indirin.",
      primaryCta: "Web Sürümünü Aç",
      secondaryCta: "Windows Uygulamasını İndir",
    },
    footer: {
      description: "İş süreçleri için profesyonel PDF yönetim yazılımı.",
      availability: "Web + Windows kullanımı",
      security: "Güvenli belge operasyonları",
      contact: "İletişim",
    },
    contactSection: {
      kicker: "İletişim",
      title: "Ekibimize mesaj gönderin",
      description: "İhtiyacınızı yazın, size en kısa sürede dönüş yapalım.",
      nameLabel: "Ad Soyad",
      emailLabel: "E-posta",
      messageLabel: "Mesaj",
      submit: "Mesaj Gönder",
      submitting: "Gönderiliyor...",
      success: "Mesajınız başarıyla gönderildi.",
      errorFallback: "Mesajınız gönderilemedi.",
      validation: {
        nameRequired: "Lütfen adınızı girin.",
        nameTooShort: "Lütfen adınızı girin (en az 2 karakter).",
        emailRequired: "Lütfen e-posta adresinizi girin.",
        emailInvalid: "Lütfen geçerli bir e-posta adresi girin.",
        messageRequired: "Lütfen mesajınızı girin.",
        messageTooShort: "Lütfen mesajınızı girin (en az 10 karakter).",
      },
      honeypotLabel: "Bu alanı boş bırakın",
    },
  },
};

