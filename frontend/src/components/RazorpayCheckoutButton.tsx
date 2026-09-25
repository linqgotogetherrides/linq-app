import React, { ReactNode, useCallback, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Modal,
  Platform,
  Pressable,
  StyleProp,
  StyleSheet,
  Text,
  TextStyle,
  ViewStyle,
} from 'react-native';
import { WebView, WebViewMessageEvent } from 'react-native-webview';
import { useApp } from '@/src/context/AppContext';

const SUPABASE_URL = (process.env.EXPO_PUBLIC_SUPABASE_URL || '').replace(/\/$/, '');
const SUPABASE_ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || '';
const FUNCTIONS_URL = `${SUPABASE_URL}/functions/v1`;
const CREATE_ORDER_URL = `${FUNCTIONS_URL}/create-razorpay-order`;
const VERIFY_PAYMENT_URL = `${FUNCTIONS_URL}/verify-razorpay-payment`;
const RAZORPAY_CALLBACK_URL = `${FUNCTIONS_URL}/razorpay-callback`;
const RAZORPAY_KEY_ID = process.env.EXPO_PUBLIC_RAZORPAY_KEY_ID || '';
const CHECKOUT_SCRIPT = 'https://checkout.razorpay.com/v1/checkout.js';

const FUNCTION_HEADERS = {
  'Content-Type': 'application/json',
  apikey: SUPABASE_ANON_KEY,
  Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
};

type RazorpayOrder = {
  order_id: string;
  amount: number;
  currency: string;
  key_id?: string;
};

type RazorpayPayment = {
  razorpay_payment_id: string;
  razorpay_order_id: string;
  razorpay_signature: string;
};

type RazorpayFailure = {
  error?: {
    description?: string;
    code?: string;
  };
};

type RazorpayOptions = {
  key: string;
  amount: number;
  currency: string;
  order_id: string;
  name: string;
  description: string;
  handler: (response: RazorpayPayment) => void;
  modal: {
    ondismiss: () => void;
  };
  prefill?: {
    name?: string;
    email?: string;
    contact?: string;
  };
  notes?: Record<string, string>;
};

type RazorpayInstance = {
  open: () => void;
  on?: (event: string, callback: (response: RazorpayFailure) => void) => void;
};

declare global {
  interface Window {
    Razorpay?: new (options: RazorpayOptions) => RazorpayInstance;
  }
}

interface Props {
  amountPaise: number;
  receipt: string;
  plan?: string;
  currency?: string;
  title?: string;
  description?: string;
  children?: ReactNode;
  style?: StyleProp<ViewStyle>;
  textStyle?: StyleProp<TextStyle>;
  disabled?: boolean;
  testID?: string;
  prefill?: RazorpayOptions['prefill'];
  onSuccess?: (payment: RazorpayPayment) => void | Promise<void>;
  onDismiss?: () => void;
  onError?: (message: string) => void;
}

const NATIVE_CHECKOUT_HTML = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <script src="${CHECKOUT_SCRIPT}"></script>
  <style>
    html, body { margin: 0; padding: 0; background: #ffffff; }
  </style>
</head>
<body>
<script>
  function send(payload) {
    if (window.ReactNativeWebView) {
      window.ReactNativeWebView.postMessage(JSON.stringify(payload));
    }
  }

  window.openCheckout = function(config) {
    if (!window.Razorpay) {
      send({ type: 'failed', message: 'Razorpay checkout could not be loaded' });
      return;
    }

    var checkout = new window.Razorpay({
      key: config.key,
      amount: config.amount,
      currency: config.currency,
      order_id: config.order_id,
      name: config.name,
      description: config.description,
      prefill: config.prefill || {},
      notes: { product: config.plan || 'linq' },
      callback_url: config.callback_url,
      redirect: true,
      webview_intent: true,
      modal: { ondismiss: function() { send({ type: 'dismissed' }); } },
      handler: function(response) {
        send({ type: 'success', response: response });
      }
    });

    if (checkout.on) {
      checkout.on('payment.failed', function(response) {
        send({
          type: 'failed',
          message: response && response.error && response.error.description
            ? response.error.description
            : 'Payment failed'
        });
      });
    }
    checkout.open();
  };

  send({ type: 'ready' });
</script>
</body>
</html>`;

async function readJson(response: Response) {
  try {
    return await response.json();
  } catch {
    return {};
  }
}

function requireSupabaseConfig() {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    throw new Error('Supabase payment functions are not configured');
  }
}

function loadCheckoutScript() {
  if (typeof document === 'undefined') return Promise.reject(new Error('Checkout requires a web browser'));
  if (window.Razorpay) return Promise.resolve();

  return new Promise<void>((resolve, reject) => {
    const existing = document.querySelector(`script[src="${CHECKOUT_SCRIPT}"]`) as HTMLScriptElement | null;
    if (existing) {
      if (window.Razorpay) {
        resolve();
      } else {
        existing.addEventListener('load', () => resolve(), { once: true });
        existing.addEventListener('error', () => reject(new Error('Razorpay checkout failed to load')), { once: true });
      }
      return;
    }

    const script = document.createElement('script');
    script.src = CHECKOUT_SCRIPT;
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error('Razorpay checkout failed to load'));
    document.head.appendChild(script);
  });
}

export default function RazorpayCheckoutButton({
  amountPaise,
  receipt,
  plan,
  currency = 'INR',
  title = 'LinQ',
  description = 'LinQ payment',
  children,
  style,
  textStyle,
  disabled = false,
  testID,
  prefill,
  onSuccess,
  onDismiss,
  onError,
}: Props) {
  const [loading, setLoading] = useState(false);
  const { user } = useApp();
  const [nativeVisible, setNativeVisible] = useState(false);
  const [nativeOrder, setNativeOrder] = useState<RazorpayOrder | null>(null);
  const nativeWebViewRef = useRef<WebView>(null);
  const settledRef = useRef(false);

  const reportError = useCallback((message: string) => {
    setLoading(false);
    if (onError) {
      onError(message);
    } else {
      Alert.alert('Payment unavailable', message);
    }
  }, [onError]);

  const createOrder = useCallback(async (): Promise<RazorpayOrder> => {
    requireSupabaseConfig();
    if (!Number.isInteger(amountPaise) || amountPaise < 100) {
      throw new Error('Payment amount must be at least 100 paise');
    }

    const response = await fetch(CREATE_ORDER_URL, {
      method: 'POST',
      headers: FUNCTION_HEADERS,
      body: JSON.stringify({
        amount: amountPaise,
        currency,
        receipt: `${receipt}-${Date.now()}`.slice(0, 100),
        plan,
        // Required by milestone-gated plans (game_annual) so the backend can
        // verify the unlock instead of trusting the client.
        user_id: user?.id ?? undefined,
      }),
    });
    const data = await readJson(response);
    if (!response.ok || !data.order_id) {
      throw new Error(data.error || data.detail || 'Unable to create payment order');
    }
    if (data.key_id && data.key_id !== RAZORPAY_KEY_ID) {
      throw new Error('Razorpay key configuration mismatch. Update the frontend key and Supabase secrets.');
    }
    return data as RazorpayOrder;
  }, [amountPaise, currency, plan, receipt, user?.id]);

  const verifyPayment = useCallback(async (payment: RazorpayPayment) => {
    requireSupabaseConfig();
    const response = await fetch(VERIFY_PAYMENT_URL, {
      method: 'POST',
      headers: FUNCTION_HEADERS,
      body: JSON.stringify(payment),
    });
    const data = await readJson(response);
    if (!response.ok || data.verified !== true) {
      throw new Error(data.error || data.detail || 'Payment verification failed');
    }
  }, []);

  const completePayment = useCallback(async (payment: RazorpayPayment) => {
    if (settledRef.current) return;
    settledRef.current = true;
    try {
      await verifyPayment(payment);
      await onSuccess?.(payment);
      setLoading(false);
      setNativeVisible(false);
    } catch (error) {
      settledRef.current = false;
      reportError(error instanceof Error ? error.message : 'Payment verification failed');
    }
  }, [onSuccess, reportError, verifyPayment]);

  const openWebCheckout = useCallback(async (order: RazorpayOrder) => {
    if (!RAZORPAY_KEY_ID) throw new Error('Razorpay key is not configured');
    if (window.location.protocol !== 'https:') {
      throw new Error('Razorpay checkout requires HTTPS. Start Expo with an HTTPS tunnel or test the native app.');
    }
    await loadCheckoutScript();
    if (!window.Razorpay) throw new Error('Razorpay checkout could not be loaded');

    settledRef.current = false;
    const checkout = new window.Razorpay({
      key: RAZORPAY_KEY_ID,
      amount: order.amount,
      currency: order.currency,
      order_id: order.order_id,
      name: title,
      description,
      prefill,
      notes: plan ? { product: plan } : undefined,
      handler: (payment) => {
        void completePayment(payment);
      },
      modal: {
        ondismiss: () => {
          setLoading(false);
          onDismiss?.();
        },
      },
    });

    checkout.on?.('payment.failed', (failure) => {
      reportError(failure.error?.description || 'Payment failed');
    });
    checkout.open();
  }, [completePayment, description, onDismiss, plan, prefill, reportError, title]);

  const handlePress = async () => {
    if (loading || disabled) return;
    setLoading(true);
    setNativeVisible(false);
    settledRef.current = false;

    try {
      const order = await createOrder();
      if (Platform.OS === 'web') {
        await openWebCheckout(order);
      } else {
        setNativeOrder(order);
        setNativeVisible(true);
      }
    } catch (error) {
      reportError(error instanceof Error ? error.message : 'Unable to start payment');
    }
  };

  const handleNativeMessage = async (event: WebViewMessageEvent) => {
    let message: {
      type?: string;
      message?: string;
      response?: RazorpayPayment;
    };
    try {
      message = JSON.parse(event.nativeEvent.data);
    } catch {
      return;
    }

    if (message.type === 'ready' && nativeOrder) {
      nativeWebViewRef.current?.injectJavaScript(
        `window.openCheckout(${JSON.stringify({
          key: RAZORPAY_KEY_ID,
          amount: nativeOrder.amount,
          currency: nativeOrder.currency,
          order_id: nativeOrder.order_id,
          name: title,
          description,
          plan,
          prefill,
          callback_url: RAZORPAY_CALLBACK_URL,
        })}); true;`
      );
    } else if (message.type === 'success' && message.response) {
      await completePayment(message.response);
    } else if (message.type === 'failed') {
      reportError(message.message || 'Payment failed');
      setNativeVisible(false);
    } else if (message.type === 'dismissed') {
      setLoading(false);
      setNativeVisible(false);
      onDismiss?.();
    }
  };

  return (
    <>
      <Pressable
        testID={testID}
        onPress={handlePress}
        disabled={disabled || loading}
        style={({ pressed }) => [
          styles.trigger,
          pressed && !disabled && styles.pressed,
          disabled && styles.disabled,
          style,
        ]}
      >
        {loading ? (
          <ActivityIndicator size="small" color={colorsForTrigger(textStyle)} />
        ) : (
          children || <Text style={[styles.defaultText, textStyle]}>{title}</Text>
        )}
      </Pressable>

      {Platform.OS !== 'web' && (
        <Modal
          visible={nativeVisible}
          animationType="slide"
          onRequestClose={() => {
            setNativeVisible(false);
            setLoading(false);
          }}
        >
          <WebView
            ref={nativeWebViewRef}
            source={{ html: NATIVE_CHECKOUT_HTML }}
            originWhitelist={['*']}
            javaScriptEnabled
            domStorageEnabled
            onMessage={handleNativeMessage}
            style={styles.webView}
          />
        </Modal>
      )}
    </>
  );
}

function colorsForTrigger(textStyle?: StyleProp<TextStyle>) {
  return StyleSheet.flatten(textStyle)?.color || '#FFFFFF';
}

const styles = StyleSheet.create({
  trigger: {
    minHeight: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pressed: { opacity: 0.85 },
  disabled: { opacity: 0.5 },
  defaultText: { color: '#FFFFFF', fontSize: 14, fontWeight: '500' },
  webView: { flex: 1 },
});
