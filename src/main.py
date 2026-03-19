import customtkinter as ctk
from tkinter import filedialog, messagebox
import pdf_engine  # Az önce oluşturduğumuz dosyayı çağırıyoruz
import os


class NBPDFApp(ctk.CTk):
    def __init__(self):
        super().__init__()
        self.title("NB Global Studio - PDF Professional")
        self.geometry("500x400")

        # Arayüz Elemanları
        self.label = ctk.CTkLabel(self, text="NB PDF Tools v1.0", font=("Arial", 22, "bold"))
        self.label.pack(pady=20)

        self.btn_select = ctk.CTkButton(self, text="PDF Dosyası Seç", command=self.select_file)
        self.btn_select.pack(pady=10)

        self.lbl_path = ctk.CTkLabel(self, text="Dosya seçilmedi...", font=("Arial", 10))
        self.lbl_path.pack()

        self.entry_page = ctk.CTkEntry(self, placeholder_text="Ayıklanacak Sayfa No")
        self.entry_page.pack(pady=20)

        self.btn_run = ctk.CTkButton(self, text="Sayfayı Ayır ve Kaydet", fg_color="darkgreen",
                                     command=self.run_process)
        self.btn_run.pack(pady=10)

        self.selected_file = ""

    def select_file(self):
        self.selected_file = filedialog.askopenfilename(filetypes=[("PDF Dosyaları", "*.pdf")])
        if self.selected_file:
            self.lbl_path.configure(text=os.path.basename(self.selected_file))

    def run_process(self):
        if not self.selected_file or not self.entry_page.get():
            messagebox.showwarning("Hata", "Lütfen kaynak dosyayı seçin ve sayfa numarasını girin!")
            return

        try:
            page = int(self.entry_page.get())

            # --- YENİ KISIM: KAYIT YERİ SORMA ---
            # Varsayılan bir dosya adı öneriyoruz
            önerilen_ad = f"NB_Ayiklanan_Sayfa_{page}.pdf"

            kayit_yolu = filedialog.asksaveasfilename(
                defaultextension=".pdf",
                initialfile=önerilen_ad,
                filetypes=[("PDF Dosyaları", "*.pdf")],
                title="Dosyayı Nereye Kaydetmek İstersiniz?"
            )

            # Eğer kullanıcı "İptal"e basarsa işlem yapma
            if not kayit_yolu:
                return

            # İşlemi engine üzerinden gerçekleştir
            pdf_engine.extract_single_page(self.selected_file, kayit_yolu, page)

            messagebox.showinfo("Başarılı", f"İşlem tamamlandı!\nDosya şuraya kaydedildi:\n{kayit_yolu}")

        except ValueError:
            messagebox.showerror("Hata", "Lütfen sayfa numarası kısmına sadece sayı girin!")
        except Exception as e:
            messagebox.showerror("Hata", f"Bir hata oluştu: {e}")


if __name__ == "__main__":
    app = NBPDFApp()
    app.mainloop()