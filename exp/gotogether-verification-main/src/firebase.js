
import { initializeApp } from "firebase/app";
import { getMessaging, isSupported } from "firebase/messaging";

const firebaseConfig = {
  apiKey: "AIzaSyDpG88x6P8UN3fhr3RdHI5EjSEDhquSMH4",
  authDomain: "gotogetherrides-verification.firebaseapp.com",
  projectId: "gotogetherrides-verification",
  storageBucket: "gotogetherrides-verification.firebasestorage.app",
  messagingSenderId: "814411270628",
  appId: "1:814411270628:web:5789915f3e208b07875ff1",
};

export const firebaseApp = initializeApp(firebaseConfig);

export async function getFirebaseMessaging() {
  if (typeof window === "undefined") return null;

  try {
    if (!(await isSupported())) return null;
    return getMessaging(firebaseApp);
  } catch {
    return null;
  }
}

