export const signInWithPhoneNumber = async (phone: string) => {
  console.log(`[Web Mock] Sending OTP to ${phone}`);

  return {
    confirm: async (code: string) => {
      console.log(`[Web Mock] Verified code ${code}`);
      return { user: { uid: `web-uid-${phone}`, phoneNumber: phone } };
    },
  };
};

export const signOut = async () => {};
