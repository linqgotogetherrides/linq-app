export const signInWithPhoneNumber = async (phone: string) => {
  console.log(`[Web Mock] Sending OTP to ${phone}`);
  
  // Return a mock confirmation result object
  return {
    confirm: async (code: string) => {
      console.log(`[Web Mock] Verified code ${code}`);
      return { user: { uid: `web-uid-${phone}`, phoneNumber: phone } };
    }
  };
};
