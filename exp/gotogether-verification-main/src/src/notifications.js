
import { getToken, onMessage } from "firebase/messaging";
import { getFirebaseMessaging } from "./firebase";

// Your Firebase Web Push public key
const VAPID_KEY =
  "BE3FAFA8q5-VxNK_pX5F2J87NVf7k7Mwh6dsBeaM_bXerNe5h-pwufqjH28o63zrBukLY1Q7V4Gk0JiSc_d7dM0";

export async function enableNotifications() {
  if (!("Notification" in window) || !("serviceWorker" in navigator)) {
    throw new Error(
      "Push notifications are not supported by this browser."
    );
  }

  const permission = await Notification.requestPermission();

  if (permission !== "granted") {
    throw new Error(
      "Please allow notifications in your browser settings."
    );
  }

  const messaging = await getFirebaseMessaging();

  if (!messaging) {
    throw new Error(
      "Firebase messaging is not supported by this browser."
    );
  }

  const registration = await navigator.serviceWorker.register(
    "/firebase-messaging-sw.js"
  );

  const token = await getToken(messaging, {
    vapidKey: VAPID_KEY,
    serviceWorkerRegistration: registration,
  });

  if (!token) {
    throw new Error(
      "Could not register this device for notifications."
    );
  }

  return token;
}

export async function listenForForegroundNotifications(callback) {
  const messaging = await getFirebaseMessaging();

  if (!messaging) {
    return () => {};
  }

  return onMessage(messaging, (payload) => {
    callback({
      title: payload.notification?.title || "GoTogetherRides",
      body:
        payload.notification?.body ||
        "You have a verification update.",
    });
  });
}
