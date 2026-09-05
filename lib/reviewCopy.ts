// Client-safe review copy, types and validation. No Node imports here: this
// file is bundled into the public /review/[token] page. Server-only helpers
// (tokens, data access, cron timing) live in ./reviews.ts.

export type ReviewLang = 'en' | 'es';
export type ReviewStatus = 'requested' | 'submitted' | 'approved' | 'hidden' | 'declined';

export type ReviewRow = {
  id: string;
  household_id: string;
  student_id: string | null;
  tutor_id: string | null;
  parent_email: string | null;
  token: string;
  language: ReviewLang;
  source: 'auto' | 'manual';
  created_at: string;
  requested_at: string | null;
  reminded_at: string | null;
  submitted_at: string | null;
  rating: number | null;
  body: string | null;
  reviewer_name: string | null;
  reviewer_suburb: string | null;
  consent_public: boolean;
  status: ReviewStatus;
  approved_at: string | null;
};

/** What the public site renders. Never includes anything the family did not approve for display. */
export type PublicReview = {
  id: string;
  rating: number;
  body: string;
  reviewer_name: string;
  reviewer_suburb: string | null;
  student_year_level: string | null;
  subject: string | null;
  approved_at: string;
};

export const REVIEW_TOKEN_RE = /^[A-Za-z0-9_-]{20,64}$/;

// ---------------------------------------------------------------------------
// Copy for the /review/[token] page, in both languages.
// ---------------------------------------------------------------------------

export const REVIEW_COPY = {
  en: {
    title: 'How is tutoring going?',
    kicker: 'Two minutes, in your own words',
    intro: (student: string | null, tutor: string | null) =>
      `Thanks for being one of our first families. A few honest sentences about ${student ? `${student}'s` : 'your child\'s'} lessons${tutor ? ` with ${tutor}` : ''} help other parents decide, and help us get better. We show reviews only with your permission, and we never edit the words.`,
    ratingLabel: 'Overall, how would you rate the tutoring so far?',
    ratingHint: '1 is poor, 5 is excellent.',
    bodyLabel: 'What has it been like? What changed for your child?',
    bodyPlaceholder: 'A few sentences is plenty. Specific is better than glowing.',
    nameLabel: 'How should we show your name?',
    namePlaceholder: 'For example: Priya, parent of a Year 11 student',
    nameHint: 'First name only is fine. We never show surnames, emails or your child\'s full name.',
    suburbLabel: 'Suburb (optional)',
    consentLabel: 'You may show this review on crestio.ai with the name and suburb above.',
    consentHint: 'Leave this unticked and only Crestio reads it.',
    submit: 'Send review',
    sending: 'Sending',
    thanksTitle: 'Thank you.',
    thanksBody: 'Your review has been sent. If you agreed to it being shown, it appears on the site once it has been read by a person, usually within a day or two.',
    googleTitle: 'One more thing, if you have a minute',
    googleBody: 'A review on Google helps other families find us. It takes about a minute.',
    googleCta: 'Review Crestio on Google',
    already: 'This review has already been sent. Thank you again.',
    invalid: 'This link is not valid or has expired. If you meant to leave a review, reply to any email from Crestio and we will send a fresh link.',
    errors: {
      rating: 'Choose a rating from 1 to 5.',
      body: 'Write at least a sentence or two.',
      name: 'Tell us how to show your name, or untick the permission box.',
    },
  },
  es: {
    title: '¿Cómo van las clases?',
    kicker: 'Dos minutos, con tus palabras',
    intro: (student: string | null, tutor: string | null) =>
      `Gracias por ser una de nuestras primeras familias. Unas frases sinceras sobre las clases${student ? ` de ${student}` : ''}${tutor ? ` con ${tutor}` : ''} ayudan a otros padres a decidir y nos ayudan a mejorar. Solo mostramos reseñas con tu permiso y nunca cambiamos las palabras.`,
    ratingLabel: 'En general, ¿cómo calificarías las clases hasta ahora?',
    ratingHint: '1 es malo, 5 es excelente.',
    bodyLabel: '¿Cómo ha sido? ¿Qué cambió para tu hijo o hija?',
    bodyPlaceholder: 'Con unas frases basta. Lo concreto vale más que lo elogioso.',
    nameLabel: '¿Cómo mostramos tu nombre?',
    namePlaceholder: 'Por ejemplo: Carla, madre de un alumno de Year 11',
    nameHint: 'Con el nombre de pila basta. Nunca mostramos apellidos, correos ni el nombre completo de tu hijo o hija.',
    suburbLabel: 'Suburbio (opcional)',
    consentLabel: 'Pueden mostrar esta reseña en crestio.ai con el nombre y el suburbio de arriba.',
    consentHint: 'Si no marcas esta casilla, solo la lee Crestio.',
    submit: 'Enviar reseña',
    sending: 'Enviando',
    thanksTitle: 'Gracias.',
    thanksBody: 'Tu reseña se envió. Si aceptaste que se muestre, aparecerá en el sitio cuando la lea una persona, normalmente en uno o dos días.',
    googleTitle: 'Una cosa más, si tienes un minuto',
    googleBody: 'Una reseña en Google ayuda a otras familias a encontrarnos. Toma alrededor de un minuto.',
    googleCta: 'Reseñar a Crestio en Google',
    already: 'Esta reseña ya fue enviada. Gracias otra vez.',
    invalid: 'Este enlace no es válido o venció. Si querías dejar una reseña, responde a cualquier correo de Crestio y te mandamos uno nuevo.',
    errors: {
      rating: 'Elige una calificación del 1 al 5.',
      body: 'Escribe al menos una o dos frases.',
      name: 'Dinos cómo mostrar tu nombre, o desmarca la casilla de permiso.',
    },
  },
} as const;

// ---------------------------------------------------------------------------
// Validation for a submitted review (shared by the API and its tests).
// ---------------------------------------------------------------------------

export type ReviewSubmission = {
  rating: number;
  body: string;
  reviewer_name: string | null;
  reviewer_suburb: string | null;
  consent_public: boolean;
};

export function validateReviewSubmission(input: Record<string, unknown>, lang: ReviewLang): { ok: true; value: ReviewSubmission } | { ok: false; error: string } {
  const c = REVIEW_COPY[lang].errors;
  const rating = typeof input.rating === 'number' ? input.rating : Number(input.rating);
  if (!Number.isInteger(rating) || rating < 1 || rating > 5) return { ok: false, error: c.rating };
  const body = typeof input.body === 'string' ? input.body.trim().replace(/\s+\n/g, '\n') : '';
  if (body.length < 12) return { ok: false, error: c.body };
  const consent = input.consent_public === true || input.consent_public === 'true';
  const name = typeof input.reviewer_name === 'string' ? input.reviewer_name.trim().slice(0, 80) : '';
  if (consent && name.length < 2) return { ok: false, error: c.name };
  const suburb = typeof input.reviewer_suburb === 'string' ? input.reviewer_suburb.trim().slice(0, 60) : '';
  return {
    ok: true,
    value: {
      rating,
      body: body.slice(0, 2000),
      reviewer_name: name || null,
      reviewer_suburb: suburb || null,
      consent_public: consent,
    },
  };
}

