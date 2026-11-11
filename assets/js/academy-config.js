// ==========================================================================
// iContact Academy — payment details shown on every course's Enrol form.
// --------------------------------------------------------------------------
// ⚠️  EDIT ME. Leave a value as '' to hide it. While all are empty, students
//     are told you'll WhatsApp them payment details after they enrol.
// ==========================================================================

export const ACADEMY_PAYMENT = {
  // EcoCash merchant or personal number students pay to, and the name it shows.
  ecocashNumber: '',          // e.g. '+263 77 123 4567' or merchant code '123456'
  ecocashName: '',            // e.g. 'iContact Africa Solutions'

  // Paynow: a payment link or "Paynow button" URL from your Paynow merchant account.
  paynowLink: '',             // e.g. 'https://www.paynow.co.zw/Payment/Link/?q=...'

  // Bank transfer details, one line each.
  bankLines: [
    // 'Bank: CBZ',
    // 'Account name: iContact Africa Solutions',
    // 'Account number: 0000000000',
    // 'Branch: Harare',
  ],

  // Pay online with Paynow (EcoCash / OneMoney prompt or Paynow checkout) with instant access.
  // Turns on automatically once the PAYNOW_* secrets are saved in Supabase. Set to false to hide it.
  paynowCheckout: false, // off until Paynow accepts connections from Supabase (see setup guide)

  // Where students should send proof of payment / questions.
  whatsapp: '263718574277',
};
