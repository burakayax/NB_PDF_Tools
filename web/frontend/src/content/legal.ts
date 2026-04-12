import type { Language } from "../i18n/landing";

type LegalSection = {
  title: string;
  paragraphs: string[];
};

type LegalDocument = {
  title: string;
  summary: string;
  effectiveDateLabel: string;
  effectiveDate: string;
  sections: LegalSection[];
};

type CookieNoticeCopy = {
  title: string;
  description: string;
  accept: string;
  learnMore: string;
};

export const legalDocuments: Record<Language, { terms: LegalDocument; privacy: LegalDocument; cookieNotice: CookieNoticeCopy }> = {
  en: {
    terms: {
      title: "Terms of Service",
      summary:
        "These Terms of Service (“Terms”) form a binding agreement between you and NB Global Studio regarding NB PDF TOOLS. They set out how you may use the product, what we expect from you, how subscriptions work, and the limits of our liability. They do not replace our Privacy Policy, which covers personal data only.",
      effectiveDateLabel: "Effective date",
      effectiveDate: "24 March 2026",
      sections: [
        {
          title: "1. Who we are and what you accept",
          paragraphs: [
            "NB PDF TOOLS is operated by NB Global Studio (“we”, “us”). By creating an account, subscribing, or otherwise using the service, you confirm that you have read these Terms and agree to be bound by them.",
            "If you use the service on behalf of a company, you represent that you are authorized to accept these Terms for that organization.",
          ],
        },
        {
          title: "2. The service",
          paragraphs: [
            "NB PDF TOOLS provides software and web-based TOOLS for working with PDF and related documents (for example merge, split, conversion, compression, and encryption), together with account, authentication, and subscription features.",
            "We may change, suspend, or discontinue parts of the service for security, legal, operational, or product reasons. We do not guarantee uninterrupted or error-free operation.",
          ],
        },
        {
          title: "3. Usage rules (acceptable use)",
          paragraphs: [
            "You must use the service only in compliance with applicable laws and regulations. You must not use it to process unlawful content, infringe others’ rights, or circumvent technical or contractual limits.",
            "You must not probe, attack, or overload our systems; scrape or automate access in a way that harms performance or security; resell or redistribute the service without our written consent; or misrepresent your identity or affiliation.",
            "You are responsible for documents you upload or process and for ensuring you have the right to use them. We do not review your files for legality; you remain responsible for your own compliance.",
            "We may investigate suspected abuse and may suspend or terminate access, with or without notice, where we reasonably believe these rules or the security of the service are at risk.",
          ],
        },
        {
          title: "4. Accounts and security",
          paragraphs: [
            "You must provide accurate registration information and keep it up to date. You are responsible for safeguarding passwords, API tokens, and any other credentials.",
            "You must notify us promptly if you suspect unauthorized use of your account. We may require additional verification before restoring access.",
          ],
        },
        {
          title: "5. Subscription terms",
          paragraphs: [
            "Certain features or higher usage limits may require a paid plan. Plan names, prices, included features, and fair-use rules are those shown in the product, checkout, or order confirmation at the time you subscribe.",
            "Subscriptions renew according to the billing cycle you select (for example monthly or annual) until you cancel in accordance with the cancellation process we provide. Failure to pay may result in downgrade or loss of paid features.",
            "We may change plan prices or features for new purchases or renewals with reasonable notice where required by law. Continued use after a renewal may constitute acceptance of the updated plan terms.",
            "Taxes, if any, are your responsibility unless we state otherwise at checkout.",
          ],
        },
        {
          title: "6. Limitations (disclaimers and liability cap)",
          paragraphs: [
            "The service is provided “as is” and “as available”. To the fullest extent permitted by law, we disclaim implied warranties such as merchantability, fitness for a particular purpose, and non-infringement.",
            "We are not liable for loss of profits, loss of data, business interruption, or indirect, incidental, special, consequential, or punitive damages arising from your use of the service, even if we have been advised of the possibility of such damages.",
            "Our aggregate liability for any claim arising out of or related to these Terms or the service shall not exceed the greater of (a) the amount you paid us for the service in the twelve (12) months before the event giving rise to the claim, or (b) fifty U.S. dollars (USD 50), except where liability cannot be limited under mandatory law.",
            "Some jurisdictions do not allow certain limitations; in those cases our liability is limited to the maximum extent permitted.",
          ],
        },
        {
          title: "7. Intellectual property",
          paragraphs: [
            "NB PDF TOOLS, its branding, software, documentation, and related materials are owned by NB Global Studio or its licensors. These Terms do not grant you ownership of any intellectual property rights beyond the limited right to use the service as offered.",
            "You retain rights in your own content. You grant us only the rights reasonably necessary to operate the service (for example processing files you submit and hosting account data).",
          ],
        },
        {
          title: "8. Termination",
          paragraphs: [
            "You may stop using the service at any time. We may suspend or terminate your access if you materially breach these Terms, if we are required to do so by law, or if we wind down the service with reasonable notice where practicable.",
            "Provisions that by their nature should survive (including limitations of liability, intellectual property, and governing law) will survive termination.",
          ],
        },
        {
          title: "9. Governing law and disputes",
          paragraphs: [
            "These Terms are governed by the laws applicable in the jurisdiction we designate in a separate agreement with you, or otherwise by the laws of the country where NB Global Studio is established, without regard to conflict-of-law rules.",
            "For informal resolution of disputes, you may contact us at the email address shown in the product or on our website before initiating formal proceedings.",
          ],
        },
        {
          title: "10. Changes and contact",
          paragraphs: [
            "We may update these Terms from time to time. We will post the revised version with an updated effective date. Material changes may be communicated by email or in-product notice where appropriate.",
            "Questions about these Terms: nbglobalstudio@gmail.com.",
          ],
        },
      ],
    },
    privacy: {
      title: "Privacy Policy",
      summary:
        "This Privacy Policy describes how NB Global Studio collects, uses, stores, and protects personal information when you use NB PDF TOOLS (web application, authentication, and related services). It does not govern your contractual rights to use the product; see our Terms of Service for usage, subscriptions, and liability.",
      effectiveDateLabel: "Effective date",
      effectiveDate: "24 March 2026",
      sections: [
        {
          title: "1. Data controller",
          paragraphs: [
            "The data controller responsible for personal data processed in connection with NB PDF TOOLS is NB Global Studio. For privacy requests, use the contact email at the end of this policy.",
          ],
        },
        {
          title: "2. Personal data we collect",
          paragraphs: [
            "Account and identity: email address, authentication identifiers (including hashed passwords or OAuth provider linkage where applicable), account role, subscription or plan identifiers, preferred language, and timestamps related to account activity.",
            "Usage and product data: feature usage, operational logs needed for security and reliability, and—if you opt in—basic analytics events from the web client (such as page or screen identifiers and session context).",
            "Support and communications: content you send via contact or support channels, including your email address and message text.",
            "Technical data: IP address, browser type, device or OS hints, and error reports you allow us to collect (which may include a short stack trace or diagnostic text).",
            "We do not use this policy to describe the full contents of documents you process; processing of file content is governed by how the product works technically and by these disclosures only to the extent personal data appears inside files you choose to upload.",
          ],
        },
        {
          title: "3. Why we use personal data",
          paragraphs: [
            "To provide and secure the service: register and authenticate users, enforce plan limits, prevent fraud and abuse, and maintain infrastructure.",
            "To communicate with you: transactional messages (e.g. verification, security notices), responses to support requests, and—where permitted—product updates.",
            "To improve the product: troubleshooting, aggregated statistics, and optional analytics when you have accepted cookies for that purpose.",
            "To meet legal obligations: responding to lawful requests and retaining records where the law requires.",
          ],
        },
        {
          title: "4. Cookies and local storage",
          paragraphs: [
            "We use essential cookies or similar storage to keep you signed in (including refresh-token handling where configured), remember language preference, and record your cookie consent choice.",
            "Non-essential analytics runs in the web client only after you accept the cookie notice. You may withdraw consent by clearing storage or adjusting browser settings; some features may not work without essential storage.",
          ],
        },
        {
          title: "5. Sharing and processors",
          paragraphs: [
            "We use trusted service providers (for example hosting, email delivery, or analytics) who process data on our instructions and under appropriate safeguards.",
            "We do not sell your personal data. We may disclose information if required by law, to protect rights and safety, or in connection with a merger or asset transfer subject to continued protection of your information.",
          ],
        },
        {
          title: "6. Retention",
          paragraphs: [
            "We retain personal data only as long as needed for the purposes above, including providing the service, resolving disputes, and meeting legal, tax, or accounting requirements. When retention periods end, we delete or anonymize data where feasible.",
          ],
        },
        {
          title: "7. Security",
          paragraphs: [
            "We implement appropriate technical and organizational measures designed to protect personal data against unauthorized access, alteration, disclosure, or destruction. No method of transmission over the Internet is completely secure; we encourage strong passwords and safe account practices.",
          ],
        },
        {
          title: "8. International transfers",
          paragraphs: [
            "If we process data in countries other than your own, we will ensure appropriate safeguards where required (such as standard contractual clauses or equivalent mechanisms), consistent with applicable data protection laws.",
          ],
        },
        {
          title: "9. Your rights",
          paragraphs: [
            "Depending on where you live, you may have rights to access, rectify, delete, restrict, or object to certain processing of your personal data, and to lodge a complaint with a supervisory authority.",
            "To exercise rights, contact nbglobalstudio@gmail.com with a clear description of your request. We may need to verify your identity before responding.",
          ],
        },
        {
          title: "10. Children",
          paragraphs: [
            "NB PDF TOOLS is not directed at children under the age where parental consent is required in their jurisdiction. We do not knowingly collect personal data from such children.",
          ],
        },
        {
          title: "11. Changes to this policy",
          paragraphs: [
            "We may update this Privacy Policy from time to time. The effective date at the top will change, and we will provide additional notice for material changes where required.",
          ],
        },
        {
          title: "12. Contact",
          paragraphs: [
            "Privacy inquiries: nbglobalstudio@gmail.com.",
          ],
        },
      ],
    },
    cookieNotice: {
      title: "Cookie Notice",
      description:
        "We use essential storage for login, language preference, and consent settings. With your approval, we also collect basic page analytics to improve product quality. See our Privacy Policy for details.",
      accept: "Accept Analytics",
      learnMore: "Privacy Policy",
    },
  },
  tr: {
    terms: {
      title: "Hizmet Şartları",
      summary:
        "İşbu Hizmet Şartları (“Şartlar”), NB PDF TOOLS’un kullanımına ilişkin sizinle NB Global Studio arasında bağlayıcı bir sözleşmedir. Ürünü nasıl kullanabileceğinizi, abonelik kurallarını, yükümlülüklerinizi ve sorumluluğumuzun sınırlarını düzenler. Kişisel veriler yalnızca Gizlilik Politikamızda açıklanır; bu metin onun yerine geçmez.",
      effectiveDateLabel: "Yürürlük tarihi",
      effectiveDate: "24 Mart 2026",
      sections: [
        {
          title: "1. Taraflar ve kabul",
          paragraphs: [
            "NB PDF TOOLS, NB Global Studio (“biz”) tarafından işletilir. Hesap oluşturarak, abone olarak veya hizmeti başka şekilde kullanarak bu Şartları okuduğunuzu ve bunlara uymayı kabul ettiğinizi beyan edersiniz.",
            "Hizmeti bir işletme adına kullanıyorsanız, bu Şartları o kuruluş adına kabul etmeye yetkili olduğunuzu taahhüt edersiniz.",
          ],
        },
        {
          title: "2. Hizmetin kapsamı",
          paragraphs: [
            "NB PDF TOOLS; PDF ve ilgili belgeler üzerinde çalışmayı sağlayan yazılım ve web tabanlı araçlar (örneğin birleştirme, ayırma, dönüştürme, sıkıştırma ve şifreleme) ile hesap, kimlik doğrulama ve abonelik özelliklerini sunar.",
            "Güvenlik, yasal zorunluluklar, operasyon veya ürün gerekçeleriyle hizmetin bölümlerini değiştirebilir, askıya alabilir veya sonlandırabiliriz. Kesintisiz veya hatasız çalışma garantisi vermeyiz.",
          ],
        },
        {
          title: "3. Kullanım kuralları (kabul edilebilir kullanım)",
          paragraphs: [
            "Hizmeti yalnızca yürürlükteki mevzuata uygun kullanmalısınız. Yasadışı içerik işlemek, üçüncü kişi haklarını ihlal etmek veya teknik veya sözleşmesel sınırları aşmak için kullanamazsınız.",
            "Sistemlerimizi deneme, saldırı veya aşırı yük altında bırakma; performansı veya güvenliği zedeleyecek şekilde otomasyon veya tarama; yazılı onayımız olmadan hizmeti yeniden satma veya dağıtma; kimlik veya bağlantı bilgisi sahtekârlığı yasaktır.",
            "Yüklediğiniz veya işlediğiniz belgelerden ve bunları kullanma yetkisinden siz sorumlusunuz. Dosyalarınızın yasallığını denetlemek zorunda değiliz; uyumluluk yükümlülüğü size aittir.",
            "Kötüye kullanım şüphesinde inceleme yapabilir; bu Şartları veya hizmet güvenliğini tehdit ettiğine makul şekilde kanaat getirdiğimiz hallerde, bildirimli veya bildirimsiz erişimi askıya alabilir veya sonlandırabiliriz.",
          ],
        },
        {
          title: "4. Hesaplar ve güvenlik",
          paragraphs: [
            "Doğru kayıt bilgileri vermeli ve güncel tutmalısınız. Parolalar, API anahtarları ve diğer kimlik bilgilerinin korunması sizin sorumluluğunuzdadır.",
            "Hesabınızın yetkisiz kullanıldığından şüphelenirseniz bizi gecikmeksizin bilgilendirin. Erişimi yeniden açmadan önce ek doğrulama talep edebiliriz.",
          ],
        },
        {
          title: "5. Abonelik şartları",
          paragraphs: [
            "Bazı özellikler veya daha yüksek kullanım limitleri ücretli plan gerektirebilir. Plan adları, fiyatlar, dahil özellikler ve makul kullanım kuralları; abone olduğunuz andaki ürün, ödeme veya sipariş onayındaki hükümlerdir.",
            "Abonelikler, iptal sürecine uygun şekilde iptal edilene kadar seçtiğiniz faturalama döngüsüne (örneğin aylık veya yıllık) göre yenilenir. Ödeme yapılmaması plan düşürülmesine veya ücretli özelliklerin kaybına yol açabilir.",
            "Yasal gerekliliklere uygun makul bildirimle plan fiyatlarını veya özelliklerini yeni satın alımlar veya yenilemeler için değiştirebiliriz. Yenileme sonrası kullanım, güncellenmiş plan koşullarının kabulü anlamına gelebilir.",
            "Ödeme sırasında aksi belirtilmedikçe vergiler sizin sorumluluğunuzdadır.",
          ],
        },
        {
          title: "6. Sınırlamalar (feragatlar ve sorumluluk üst sınırı)",
          paragraphs: [
            "Hizmet “olduğu gibi” ve “müsait olduğu şekilde” sunulur. Yasal olarak izin verilen azami ölçüde; satılabilirlik, belirli bir amaca uygunluk ve ihlal etmeme dâhil zımni garantileri reddederiz.",
            "Hizmeti kullanımınızdan doğan kâr kaybı, veri kaybı, işin kesintiye uğraması veya dolaylı, arızi, özel, sonuç olarak doğan veya cezai zararlar için; bu tür zararların olasılığı konusunda uyarılmış olsak bile sorumlu tutulmayız.",
            "Bu Şartlar veya hizmetle bağlantılı herhangi bir talebe ilişkin toplam sorumluluğumuz, talebe konu olayı tetikleyen tarihten önceki on iki (12) ay içinde hizmet için bize ödediğiniz tutar ile elli ABD doları (50 USD) tutarından yüksek olanı aşamaz; zorunlu kanunda sınır konulamayan haller hariç.",
            "Bazı hukuk düzenleri belirli sınırlamalara izin vermez; bu durumlarda sorumluluğumuz kanunun izin verdiği azami ölçüde sınırlıdır.",
          ],
        },
        {
          title: "7. Fikri mülkiyet",
          paragraphs: [
            "NB PDF TOOLS, markalar, yazılım, dokümantasyon ve ilgili materyaller NB Global Studio veya lisans verenlerinin mülkiyetindedir. Bu Şartlar, sunulan hizmeti kullanma dışında mülkiyet hakkı vermez.",
            "Kendi içeriğinizdeki haklar size aittir. Hizmeti işletmek için makul ölçüde gerekli hakları (örneğin gönderdiğiniz dosyaları işleme ve hesap verilerini barındırma) bize tanırsınız.",
          ],
        },
        {
          title: "8. Sona erdirme",
          paragraphs: [
            "Hizmeti dilediğiniz zaman kullanmayı bırakabilirsiniz. Bu Şartlara önemli ölçüde aykırılık, yasal zorunluluk veya mümkünse makul önceden bildirimle hizmeti sonlandırma hallerinde erişiminizi askıya alabilir veya sonlandırabiliriz.",
            "Doğası gereği sürmesi gereken hükümler (sorumluluk sınırları, fikri mülkiyet ve uygulanacak hukuk gibi) sona ermeden sonra da geçerliliğini korur.",
          ],
        },
        {
          title: "9. Uygulanacak hukuk ve uyuşmazlıklar",
          paragraphs: [
            "Bu Şartlar; sizinle ayrıca yazılı olarak kararlaştırdığımız yargı bölgesinin hukukuna, aksi halde NB Global Studio’nun faaliyet gösterdiği ülkenin kanunlarına tabidir; çatışan hukuk kuralları uygulanmaz.",
            "Resmi yollara başvurmadan önce ürün veya web sitemizde belirtilen e-posta üzerinden bizimle iletişime geçerek çözüm arayabilirsiniz.",
          ],
        },
        {
          title: "10. Değişiklikler ve iletişim",
          paragraphs: [
            "Bu Şartları zaman zaman güncelleyebiliriz. Güncellenmiş sürümü güncellenmiş yürürlük tarihiyle yayınlarız. Önemli değişiklikleri yasal gereklilik ve uygunluk çerçevesinde e-posta veya ürün içi bildirimle duyurabiliriz.",
            "Şartlarla ilgili sorular: nbglobalstudio@gmail.com.",
          ],
        },
      ],
    },
    privacy: {
      title: "Gizlilik Politikası",
      summary:
        "Bu Gizlilik Politikası, NB PDF TOOLS’u (web uygulaması, kimlik doğrulama ve ilgili hizmetler) kullandığınızda NB Global Studio’nun kişisel verileri nasıl topladığını, kullandığını, sakladığını ve koruduğunu açıklar. Ürünü kullanma hakkınız, abonelikler ve sorumluluk sınırları Hizmet Şartlarımızda düzenlenir; bu metin onların yerine geçmez.",
      effectiveDateLabel: "Yürürlük tarihi",
      effectiveDate: "24 Mart 2026",
      sections: [
        {
          title: "1. Veri sorumlusu",
          paragraphs: [
            "NB PDF TOOLS ile bağlantılı olarak işlenen kişisel verilerden sorumlu veri sorumlusu NB Global Studio’dur. Talepler için bu politikanın sonundaki iletişim adresini kullanabilirsiniz.",
          ],
        },
        {
          title: "2. Topladığımız kişisel veriler",
          paragraphs: [
            "Hesap ve kimlik: e-posta adresi, kimlik doğrulama tanımlayıcıları (karma parolalar veya OAuth sağlayıcı bağlantısı dahil), hesap rolü, abonelik veya plan bilgisi, tercih edilen dil ve hesap etkinliğiyle ilgili zaman damgaları.",
            "Kullanım ve ürün verileri: güvenlik ve güvenilirlik için gerekli operasyon günlükleri; açık rızanızla web istemcisinden temel analitik olayları (örneğin sayfa veya ekran tanımlayıcıları ve oturum bağlamı).",
            "Destek ve iletişim: iletişim veya destek kanalları aracılığıyla gönderdiğiniz içerik, e-posta adresiniz ve mesaj metni.",
            "Teknik veriler: IP adresi, tarayıcı türü, cihaz veya işletim sistemi ipuçları ve izin verdiğiniz hata raporları (kısa yığın izi veya tanı metni içerebilir).",
            "İşlediğiniz dosyaların tam içeriğini bu politika ayrıntılı olarak listelemez; dosya içeriği ürünün teknik işleyişi kapsamında işlenir ve yalnızca kişisel veri içermesi hâlinde bu açıklamalarla ilişkilidir.",
          ],
        },
        {
          title: "3. Kişisel verileri kullanma amaçları",
          paragraphs: [
            "Hizmeti sunmak ve güvence altına almak: kullanıcı kaydı ve kimlik doğrulama, plan limitlerini uygulama, dolandırıcılık ve kötüye kullanımı önleme, altyapıyı işletme.",
            "Sizinle iletişim: işlemsel mesajlar (doğrulama, güvenlik bildirimleri), destek taleplerine yanıt ve izin verildiğinde ürün güncellemeleri.",
            "Ürünü geliştirmek: sorun giderme, toplu istatistikler ve çerez bildirimini kabul ettiğinizde isteğe bağlı analitik.",
            "Yasal yükümlülükler: yasal taleplere yanıt ve kanunun gerektirdiği sürelerle kayıt saklama.",
          ],
        },
        {
          title: "4. Çerezler ve yerel depolama",
          paragraphs: [
            "Oturumu sürdürmek (yapılandırmaya bağlı olarak yenileme belirteci dahil), dil tercihini hatırlamak ve çerez onay tercihinizi kaydetmek için zorunlu çerezler veya benzeri depolama kullanırız.",
            "Zorunlu olmayan analitik, çerez bildirimini kabul ettikten sonra web istemcisinde çalışır. Depolamayı temizleyerek veya tarayıcı ayarlarınızı değiştirerek rızanızı geri alabilirsiniz; zorunlu depolama olmadan bazı özellikler çalışmayabilir.",
          ],
        },
        {
          title: "5. Paylaşım ve işleyenler",
          paragraphs: [
            "Barındırma, e-posta gönderimi veya analitik gibi güvenilir hizmet sağlayıcıları, talimatlarımız ve uygun güvenceler çerçevesinde veri işleyebilir.",
            "Kişisel verilerinizi satmayız. Yasal zorunluluk, hakların ve güvenliğin korunması veya birleşme veya varlık devri (verilerinizin korunmasının sürmesi koşuluyla) hallerinde bilgi açıklanabilir.",
          ],
        },
        {
          title: "6. Saklama süresi",
          paragraphs: [
            "Kişisel verileri yukarıdaki amaçlar için gerekli olduğu sürece, hizmeti sunmak, uyuşmazlıkları çözmek ve yasal, vergi veya muhasebe gerekliliklerini karşılamak üzere saklarız. Süre dolduğunda, mümkün olduğunda verileri siler veya anonimleştiririz.",
          ],
        },
        {
          title: "7. Güvenlik",
          paragraphs: [
            "Kişisel verileri yetkisiz erişim, değişiklik, ifşa veya imhaya karşı korumak için uygun teknik ve idari önlemler uygularız. İnternet üzerinden iletimde mutlak güvenlik yoktur; güçlü parola ve güvenli hesap alışkanlıkları önerilir.",
          ],
        },
        {
          title: "8. Uluslararası aktarım",
          paragraphs: [
            "Verilerinizi ikamet ettiğiniz ülke dışında işlersek, geçerli veri koruma kanunlarına uygun olarak standart sözleşme maddeleri veya eşdeğer mekanizmalarla uygun güvenceleri sağlarız.",
          ],
        },
        {
          title: "9. Haklarınız",
          paragraphs: [
            "Yaşadığınız yere bağlı olarak kişisel verilerinize erişme, düzeltme, silme, işlemeyi kısıtlama veya itiraz etme ve bir denetim otoritesine şikâyette bulunma haklarınız olabilir.",
            "Taleplerinizi nbglobalstudio@gmail.com adresine net bir açıklamayla iletebilirsiniz. Yanıt vermeden önce kimliğinizi doğrulamamız gerekebilir.",
          ],
        },
        {
          title: "10. Çocuklar",
          paragraphs: [
            "NB PDF TOOLS, bulunduğu ülkede ebeveyn onayı gerektiren yaşın altındaki çocuklara yönelik değildir. Bu yaş grubundan bilerek kişisel veri toplamayız.",
          ],
        },
        {
          title: "11. Bu politikanın güncellenmesi",
          paragraphs: [
            "Bu Gizlilik Politikasını zaman zaman güncelleyebiliriz. Üstteki yürürlük tarihi değişir; önemli değişikliklerde yasal gereklilik ve uygunluk çerçevesinde ek bildirim sağlarız.",
          ],
        },
        {
          title: "12. İletişim",
          paragraphs: [
            "Gizlilik soruları: nbglobalstudio@gmail.com.",
          ],
        },
      ],
    },
    cookieNotice: {
      title: "Çerez Bildirimi",
      description:
        "Giriş, dil tercihi ve onay bilgisini saklamak için zorunlu depolama kullanıyoruz. Onayınızla birlikte ürün kalitesini iyileştirmek için temel sayfa analitiği de topluyoruz. Ayrıntılar için Gizlilik Politikamıza bakın.",
      accept: "Analitikleri kabul et",
      learnMore: "Gizlilik Politikası",
    },
  },
};
