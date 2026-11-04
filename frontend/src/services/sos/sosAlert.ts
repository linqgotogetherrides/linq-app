import { Linking } from 'react-native';

import {
  buildSosWhatsAppUrl,
  type SosAlertMessageInput,
} from './sosMessage';

export type SosWhatsAppResult = {
  opened: boolean;
  error: string | null;
};

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Unable to open WhatsApp';
}

/**
 * Opens WhatsApp with the alert pre-filled.
 *
 * This is deliberately the last step and never throws: the evidence flow must
 * always finish and tell the user what happened, even if WhatsApp is missing or
 * the device refuses the URL.
 */
export async function openSosWhatsApp(
  input: SosAlertMessageInput,
): Promise<SosWhatsAppResult> {
  try {
    const url = buildSosWhatsAppUrl(input);
    await Linking.openURL(url);
    return { opened: true, error: null };
  } catch (error) {
    return { opened: false, error: errorMessage(error) };
  }
}
