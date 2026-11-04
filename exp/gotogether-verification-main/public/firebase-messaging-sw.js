
importScripts(
  "https://www.gstatic.com/firebasejs/12.0.0/firebase-app-compat.js"
);
importScripts(
  "https://www.gstatic.com/firebasejs/12.0.0/firebase-messaging-compat.js"
);

firebase.initializeApp({
  apiKey: "AIzaSyDpG88x6P8UN3fhr3RdHI5EjSEDhquSMH4",
  authDomain: "gotogetherrides-verification.firebaseapp.com",
  projectId: "gotogetherrides-verification",
  storageBucket: "gotogetherrides-verification.firebasestorage.app",
  messagingSenderId: "814411270628",
  appId: "1:814411270628:web:5789915f3e208b07875ff1",
});

const messaging = firebase.messaging();

messaging.onBackgroundMessage((payload) => {
  const title = payload.notification?.title || "GoTogetherRides";
  const options = {
    body: payload.notification?.body || "You have a verification update.",
    icon: "/favicon.ico",
    data: payload.data || {},
  };

  self.registration.showNotification(title, options);
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  event.waitUntil(
    clients.openWindow("/")
  );
});
