import type { Language } from "./landing";

type AuthMode = "login" | "register";

type AuthCopy = {
  shared: {
    emailLabel: string;
    passwordLabel: string;
    confirmPasswordLabel: string;
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
  };
  register: {
    title: string;
    description: string;
    submit: string;
    alternatePrompt: string;
    alternateAction: string;
  };
};

export const authTranslations: Record<Language, AuthCopy> = {
  en: {
    shared: {
      emailLabel: "Email address",
      passwordLabel: "Password",
      confirmPasswordLabel: "Confirm password",
      backToLanding: "Back to landing page",
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
      title: "Sign in to NB PDF TOOLS",
      description: "Access your PDF workspace and continue your document operations securely.",
      submit: "Sign In",
      alternatePrompt: "Don't have an account yet?",
      alternateAction: "Create account",
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
      emailLabel: "E-posta adresi",
      passwordLabel: "Şifre",
      confirmPasswordLabel: "Şifreyi doğrula",
      backToLanding: "Karşılama ekranına dön",
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
      title: "NB PDF TOOLS hesabınıza giriş yapın",
      description: "PDF çalışma alanınıza güvenle erişin ve belge işlemlerinize kaldığınız yerden devam edin.",
      submit: "Giriş Yap",
      alternatePrompt: "Henüz hesabınız yok mu?",
      alternateAction: "Hesap oluştur",
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

