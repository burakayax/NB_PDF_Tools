# GitHub’a yükleme (Git — kısa rehber)

Bu dosya projeyi ilk kez Git ve GitHub ile eşleştirmek isteyenler içindir. Komutları **proje kök klasöründe** (ör. `NB_PDF_Tools`) bir terminalde çalıştırın.

---

## 1) Git başlatma

```bash
git init
```

**Ne yapar?**  
Bulunduğunuz klasörde gizli bir `.git` dizini oluşturur; bu klasör artık bir **Git deposu** olur. Versiyon geçmişi burada tutulur.

**Ne zaman?**  
Projeyi ZIP ile indirdiyseniz veya henüz `git clone` kullanmadıysanız, bir kez çalıştırmanız yeterlidir. Zaten `git clone` ile aldıysanız **tekrar `git init` yapmayın**.

---

## 2) Dosyaları ekleyip kaydetmek (commit)

```bash
git add .
git commit -m "ilk sürüm"
```

**`git add .` ne yapar?**  
İzlenen klasördeki (`.gitignore` ile hariç tutulmayan) tüm değişiklikleri **bir sonraki commit için sahneye** alır.

**`git commit` ne yapar?**  
Sahnedeki değişiklikleri kalıcı bir **anlık görüntü** olarak kaydeder. `-m "ilk sürüm"` bu kaydın kısa açıklamasıdır; istediğiniz metni yazabilirsiniz.

**Not:** İlk commit’ten önce `.env`, şifre veya anahtar içeren dosyaların repoda olmadığından emin olun (`.gitignore` bunun için vardır).

---

## 3) Uzak depoyu bağlama (remote)

Önce GitHub’da **boş bir depo** oluşturun (README eklemeseniz bile olur). Sonra depo adresinizi kullanın:

```bash
git remote add origin https://github.com/KULLANICI_ADI/DEPo_ADI.git
```

**Ne yapar?**  
Yerel depoya `origin` adında bir takma ad ekler; bu isim genelde ana GitHub adresinizi gösterir. `KULLANICI_ADI` ve `DEPo_ADI` kısımlarını kendi hesabınıza göre değiştirin.

**Kontrol:**

```bash
git remote -v
```

Adresler listelenirse bağlantı eklenmiş demektir.

**Zaten `origin` varsa:** Önce `git remote remove origin` ile kaldırıp yeniden ekleyebilir veya `git remote set-url origin YENİ_ADRES` kullanabilirsiniz.

---

## 4) GitHub’a gönderme (push)

Dal adınız `main` ise:

```bash
git push -u origin main
```

**Ne yapar?**  
Yerel commit’lerinizi GitHub’daki `origin` deposuna, `main` dalına yükler.  
`-u` (veya `--set-upstream`) bir kez verilirse; sonraki seferlerde aynı dal için yalnızca `git push` yazmanız genelde yeterli olur.

**Dal adınız `master` ise** (eski varsayılan):

```bash
git push -u origin master
```

Hangi dalda olduğunuzu görmek için:

```bash
git branch
```

İlk kez `main` kullanmak istiyorsanız ve varsayılan dal `master` ise, dalı yeniden adlandırmak için:

```bash
git branch -M main
```

ardından `git push -u origin main` kullanın.

---

## Özet sıra (yeni proje)

```text
git init
git add .
git commit -m "ilk sürüm"
git remote add origin https://github.com/KULLANICI_ADI/DEPo_ADI.git
git push -u origin main
```

Sonrasında yaptığınız değişiklikler için tipik akış:

```text
git add .
git commit -m "Kısa açıklama"
git push
```

Daha fazla ayrıntı için [GitHub Docs](https://docs.github.com) ve proje kökündeki **SETUP.md** / **README.md** dosyalarına bakabilirsiniz.
