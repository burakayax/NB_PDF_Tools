export function Marquee() {
  const items = [
    "PDF Birleştirme",
    "PDF Ayırma",
    "PDF Şifreleme",
    "PDF İmzalama",
    "Word → PDF",
    "Excel → PDF",
    "PowerPoint → PDF",
    "PDF Sıkıştırma",
    "PDF Düzenleme",
    "PDF Dönüştürme",
  ];

  const text = items.join(" · ") + " · ";

  return (
    <div className="w-full overflow-hidden py-6 -mt-16">
      <div className="flex whitespace-nowrap">
        <div className="animate-marquee flex min-w-max">
          <span className="text-xl font-semibold tracking-[0.25em] text-white/40">
            {text.repeat(20)}
          </span>
        </div>

        <div className="animate-marquee flex min-w-max">
          <span className="text-xl font-semibold tracking-[0.25em] text-white/40">
            {text.repeat(20)}
          </span>
        </div>
      </div>
    </div>
  );
}