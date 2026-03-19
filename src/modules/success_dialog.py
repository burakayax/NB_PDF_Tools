import customtkinter as ctk
import os
import subprocess


class SuccessDialog(ctk.CTkToplevel):
    def __init__(self, master, path, ortalama_func):
        super().__init__(master)
        # Gelen yolu normalize edelim (Windows/Linux uyumu ve hatalı bölüntüler için)
        self.target_path = os.path.abspath(path)
        self.ortalama_func = ortalama_func

        self.title("İşlem Başarılı")
        self.ortalama_func(self, 450, 280)
        self.grab_set()
        self.after(100, self.lift)

        ctk.CTkLabel(self, text="✅", font=("Arial", 32)).pack(pady=(20, 5))
        ctk.CTkLabel(self, text="İşlem Tamamlandı!", font=("Segoe UI", 18, "bold")).pack()

        # Kullanıcıya hangi konumun işlem gördüğünü gösterelim
        display_path = os.path.basename(self.target_path) if os.path.isfile(self.target_path) else self.target_path
        ctk.CTkLabel(self, text=display_path, font=("Arial", 11), text_color="gray", wraplength=400).pack(pady=10)

        btn_frame = ctk.CTkFrame(self, fg_color="transparent")
        btn_frame.pack(pady=15, padx=20, fill="x")

        # 1. DOSYAYI VEYA KLASÖRÜ AÇ
        # Eğer yolda tek bir PDF varsa PDF'i açar, klasörse klasörü açar
        btn_text = "📄 PDF'İ AÇ" if os.path.isfile(self.target_path) else "📂 KLASÖRÜ AÇ"
        ctk.CTkButton(btn_frame, text=btn_text, fg_color="#3498db", hover_color="#2980b9",
                      command=self.open_target).grid(row=0, column=0, padx=5, sticky="ew")

        # 2. KONUMU GÖSTER (Her zaman klasörü açar)
        ctk.CTkButton(btn_frame, text="🔍 KONUMU GÖSTER", fg_color="#f39c12", hover_color="#e67e22",
                      command=self.open_folder).grid(row=0, column=1, padx=5, sticky="ew")

        # 3. BİTTİ
        ctk.CTkButton(self, text="BİTTİ", fg_color="#95a5a6", hover_color="#7f8c8d", width=120,
                      command=self.destroy).pack(pady=(10, 20))

        btn_frame.grid_columnconfigure((0, 1), weight=1)

    def open_target(self):
        """Dosyaysa PDF okuyucuyu, klasörse gezgini açar."""
        try:
            os.startfile(self.target_path)
            self.destroy()
        except Exception as e:
            print(f"Açma hatası: {e}")

    def open_folder(self):
        """Hangi modda olursan ol, ilgili klasörü Windows Gezgini'nde açar."""
        try:
            if os.path.isfile(self.target_path):
                # Dosya ise bulunduğu klasörü al
                folder = os.path.dirname(self.target_path)
            else:
                # Zaten klasör yoluysa direkt kullan
                folder = self.target_path

            # Windows'ta klasörü seçili dahi getirebiliriz (Explorer'ı tetikler)
            os.startfile(folder)
            self.destroy()
        except Exception as e:
            print(f"Klasör açma hatası: {e}")