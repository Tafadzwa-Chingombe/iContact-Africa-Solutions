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
  paynowCheckout: true,

  // Where students should send proof of payment / questions.
  whatsapp: '263718574277',
};

// ==========================================================================
// Course trailers shown at the top of each course page, by course web address (slug).
// A trailer set in Admin Console -> Academy (courses.trailer_url) takes priority over these.
// Files live in assets/video/academy/ with -poster.jpg, -vertical.mp4 and -vertical-poster.jpg beside them.
// ==========================================================================
export const ACADEMY_TRAILERS = {
  'website-basics-for-business': 'assets/video/academy/trailer-web-basics.mp4',
  'html-css-for-beginners': 'assets/video/academy/trailer-html-css.mp4',
};
