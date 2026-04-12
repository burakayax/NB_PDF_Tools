import type { Language } from "./landing";

type AuthMode = "login" | "register";

type AuthCopy = {
  shared: {
    firstNameLabel: string;
    lastNameLabel: string;
    emailLabel: string;
    passwordLabel: string;
    backToLanding: string;
    continueWithGoogle: string;
    orContinueEmail: string;
    trustTitle: string;
    trustPoints: string[];
    errorPrefix: string;
  };
  login: {
    title: string;
    description: string;
    submit: string;
    alternatePrompt: string;
    alternateAction: string;
    forgotPassword: string;
  };
  register: {
    title: string;
    description: string;
    submit: string;
    alternatePrompt: string;
    alternateAction: string;
  };
};

export type ForgotPasswordCopy = {
  title: string;
  stepEmailTitle: string;
  stepEmailHint: string;
  stepCodeTitle: string;
  stepCodeHint: string;
  stepNewTitle: string;
  stepNewHint: string;
  emailLabel: string;
  codeLabel: string;
  newPasswordLabel: string;
  confirmPasswordLabel: string;
  sendCode: string;
  verifyCode: string;
  savePassword: string;
  backToLogin: string;
  passwordsMismatch: string;
};

export const forgotPasswordTranslations: Record<Language, ForgotPasswordCopy> = {
  en: {
    title: "Reset your password",
    stepEmailTitle: "Enter your email",
    stepEmailHint: "We will send a 6-digit code if an account exists with a password.",
    stepCodeTitle: "Enter the code",
    stepCodeHint: "Check your inbox for the code we sent.",
    stepNewTitle: "Choose a new password",
    stepNewHint: "Use at least 10 characters with upper, lower, number, and symbol.",
    emailLabel: "Email address",
    codeLabel: "6-digit code",
    newPasswordLabel: "New password",
    confirmPasswordLabel: "Confirm new password",
    sendCode: "Send code",
    verifyCode: "Continue",
    savePassword: "Update password and go to sign in",
    backToLogin: "Back to sign in",
    passwordsMismatch: "Passwords do not match.",
  },
  tr: {
    title: "Şifrenizi sıfırlayın",
    stepEmailTitle: "E-postanızı girin",
    stepEmailHint: "Şifre ile kayıtlı bir hesap varsa 6 haneli kod gönderilir.",
    stepCodeTitle: "Kodu girin",
    stepCodeHint: "Gelen kutunuzdaki kodu yazın.",
    stepNewTitle: "Yeni şifre belirleyin",
    stepNewHint: "En az 10 karakter; büyük, küçük harf, rakam ve sembol kullanın.",
    emailLabel: "E-posta adresi",
    codeLabel: "6 haneli kod",
    newPasswordLabel: "Yeni şifre",
    confirmPasswordLabel: "Yeni şifre (tekrar)",
    sendCode: "Kodu gönder",
    verifyCode: "Devam",
    savePassword: "Şifreyi güncelle ve girişe git",
    backToLogin: "Girişe dön",
    passwordsMismatch: "Şifreler eşleşmiyor.",
  },
};

export const authTranslations: Record<Language, AuthCopy> = {
  en: {
    shared: {
      firstNameLabel: "First name",
      lastNameLabel: "Last name",
      emailLabel: "Email address",
      passwordLabel: "Password",
      backToLanding: "Back to home",
      continueWithGoogle: "Continue with Google",
      orContinueEmail: "or continue with email",
      trustTitle: "What you get after sign in",
      trustPoints: [
        "Secure access to your PDF workspace",
        "Session-based authentication with refresh protection",
        "Ready foundation for subscriptions and licensing",
      ],
      errorPrefix: "Please fix the following issue:",
    },
    login: {
      title: "Sign in to NB PDF PLARTFORM",
      description: "Access your PDF workspace and continue your document operations securely.",
      submit: "Sign In",
      alternatePrompt: "Don't have an account yet?",
      alternateAction: "Create account",
      forgotPassword: "Forgot password?",
    },
    register: {
      title: "Create your account",
      description: "Set up secure access for your web workspace and future desktop licensing.",
      submit: "Create Account",
      alternatePrompt: "Already have an account?",
      alternateAction: "Sign in",
    },
  },
  tr: {
    shared: {
      firstNameLabel: "Ad",
      lastNameLabel: "Soyad",
      emailLabel: "E-posta adresi",
      passwordLabel: "Şifre",
      backToLanding: "Ana Sayfa",
      continueWithGoogle: "Google ile devam et",
      orContinueEmail: "veya e-posta ile devam edin",
      trustTitle: "Girişten sonra elde edeceğiniz yapı",
      trustPoints: [
        "PDF çalışma alanınıza güvenli erişim",
        "Yenileme korumalı oturum tabanlı kimlik doğrulama",
        "Abonelik ve lisans sistemi için hazır temel",
      ],
      errorPrefix: "Lütfen şu sorunu düzeltin:",
    },
    login: {
      title: "NB PDF PLARTFORM hesabınıza giriş yapın",
      description: "PDF çalışma alanınıza güvenle erişin ve belge işlemlerinize kaldığınız yerden devam edin.",
      submit: "Giriş Yap",
      alternatePrompt: "Henüz hesabınız yok mu?",
      alternateAction: "Hesap oluştur",
      forgotPassword: "Şifremi unuttum",
    },
    register: {
      title: "Hesabınızı oluşturun",
      description: "Web çalışma alanınız ve ilerideki masaüstü lisans yapınız için güvenli erişimi başlatın.",
      submit: "Hesap Oluştur",
      alternatePrompt: "Zaten hesabınız var mı?",
      alternateAction: "Giriş yap",
    },
  },
};

export function getAuthCopy(language: Language, mode: AuthMode) {
  return {
    shared: authTranslations[language].shared,
    screen: authTranslations[language][mode],
  };
}

/** Kimlik API’si İngilizce mesaj döndürdüğünde TR arayüzde kullanıcıya Türkçe gösterilir. */
export function translateAuthApiMessage(message: string, language: Language): string {
  if (language !== "tr" || !message.trim()) {
    return message;
  }
  const map: Record<string, string> = {
    "Invalid email or password.": "E-posta veya şifre hatalı.",
    "This account uses Google sign-in. Please use Continue with Google.":
      "Bu hesap Google ile açılmıştır. Lütfen «Google ile devam et» seçeneğini kullanın.",
    "Please verify your email address before signing in.": "Giriş yapmadan önce e-posta adresinizi doğrulayın.",
    "Please verify your email address before continuing.": "Devam etmeden önce e-posta adresinizi doğrulayın.",
    "Current password is incorrect.": "Mevcut şifreniz doğru değil.",
    "New password must be different from your current password.":
      "Yeni şifre mevcut şifrenizden farklı olmalıdır.",
    "An account with this email already exists.": "Bu e-posta adresi ile kayıtlı bir hesap zaten var.",
    "This email address cannot be used to create an account.": "Bu e-posta adresi ile yeni hesap oluşturulamaz.",
    "Password must be at least 8 characters.": "Şifre en az 8 karakter olmalıdır.",
    "Password is too long.": "Şifre çok uzun.",
    "Password must be at least 10 characters.": "Şifre en az 10 karakter olmalıdır.",
    "Password must include a lowercase letter.": "Şifre en az bir küçük harf içermelidir.",
    "Password must include an uppercase letter.": "Şifre en az bir büyük harf içermelidir.",
    "Password must include a number.": "Şifre en az bir rakam içermelidir.",
    "Password must include a symbol.": "Şifre en az bir sembol içermelidir.",
    "Current password is required.": "Mevcut şifrenizi girin.",
    "Login data is invalid.": "Giriş bilgileri geçersiz.",
    "Registration data is invalid.": "Kayıt bilgileri geçersiz.",
    "Password data is invalid.": "Şifre bilgileri geçersiz.",
    "Authentication request failed.": "Kimlik doğrulama isteği başarısız oldu.",
    "Password could not be changed.": "Şifre değiştirilemedi.",
    "Password could not be set.": "Şifre kaydedilemedi.",
    "A password is already set for this account. Use change password instead.":
      "Bu hesap için zaten bir şifre tanımlı. Şifre değiştirmeyi kullanın.",
    "Password has been set successfully.": "Şifreniz başarıyla kaydedildi.",
    "No active session found.": "Aktif oturum bulunamadı.",
    "Authentication is required.": "Oturum açmanız gerekiyor.",
    "Session refresh token is invalid.": "Oturum yenileme bilgisi geçersiz.",
    "Session refresh token has expired.": "Oturum süresi doldu; yeniden giriş yapın.",
    "User account could not be found.": "Kullanıcı hesabı bulunamadı.",
    "Email address is already verified.": "E-posta adresi zaten doğrulanmış.",
    "Invalid or expired code.": "Kod geçersiz veya süresi dolmuş.",
    "Reset session expired. Please start again from Forgot password.":
      "Oturum süresi doldu. Lütfen Şifremi unuttum adımlarını baştan yapın.",
    "This account cannot reset password here.": "Bu hesap buradan şifre sıfırlayamaz.",
    "We could not send the email. Please try again later.":
      "E-posta gönderilemedi. Lütfen daha sonra tekrar deneyin.",
    "Password has been updated. You can sign in with your new password.":
      "Şifreniz güncellendi. Yeni şifrenizle giriş yapabilirsiniz.",
  };
  if (map[message]) {
    return map[message];
  }
  if (/invalid email or password/i.test(message)) {
    return "E-posta veya şifre hatalı.";
  }
  if (/current password is incorrect/i.test(message)) {
    return "Mevcut şifreniz doğru değil.";
  }
  if (/at least 8 character/i.test(message)) {
    return "Şifre en az 8 karakter olmalıdır.";
  }
  if (/at least 10 character/i.test(message)) {
    return "Şifre en az 10 karakter olmalıdır.";
  }
  return message;
}

