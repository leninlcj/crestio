// Every string the enquiry form shows, in English and Spanish. Subject,
// year-level and goal options keep their keys from lib/agency.ts; only the
// labels are translated. Anything not translated falls back to English.

import { AGENCY, BEST_TIMES, NEEDS, SUBJECTS, type BestTimeKey, type SubjectKey, type NeedKey } from './agency';

export type EnquiryLang = 'en' | 'es';

export type EnquiryCopy = {
  lang: EnquiryLang;
  steps: [string, string, string, string, string, string];
  who: { legend: string; options: Array<[('my_child' | 'me' | 'someone_else'), string]>; error: string };
  year: { legend: string; error: string; university: string; other: string };
  subjects: { legend: string; hint: string; error: string; notListed: string; labels: Record<SubjectKey, string>; tiers: { core: string; request: string; ib: string } };
  lessons: { legend: string; modes: Array<[('online' | 'in_home' | 'either'), string]>; error: string; suburbLabel: string; suburbHint: string; suburbError: string };
  focus: { legend: string; hint: string; labels: Record<NeedKey, string> };
  contact: {
    legend: string; name: string; nameError: string; student: string; optional: string; email: string; emailError: string;
    phone: string; phoneError: string; message: string; messagePlaceholder: string; consent: string; privacyLink: string;
  };
  buttons: { back: string; next: string; send: string; sending: string; home: string };
  done: { kicker: string; heading: (first: string) => string; body: (email: string) => string; sooner: string };
  serverError: string; genericError: string;
};

export const ENQUIRY_COPY_EN: EnquiryCopy = {
  lang: 'en',
  steps: ['Who', 'Year', 'Subjects', 'Lessons', 'Focus', 'Contact'],
  who: { legend: 'Who needs tutoring?', options: [['my_child', 'My child'], ['me', 'Me'], ['someone_else', 'Someone else']], error: 'Choose one.' },
  year: { legend: 'Which year level?', error: 'Choose a year level.', university: 'University', other: 'Other' },
  subjects: {
    legend: 'Which subjects?', hint: 'Choose all that apply.', error: 'Choose at least one subject.',
    notListed: 'Need something not listed? Mention it on the last step and we will tell you plainly whether we can help.',
    labels: Object.fromEntries(SUBJECTS.map((s) => [s.key, s.label])) as Record<SubjectKey, string>,
    tiers: { core: 'Maths and science', request: 'Other HSC subjects, by request', ib: 'IB Diploma' },
  },
  lessons: {
    legend: 'Online or in-home?', modes: [['online', 'Online'], ['in_home', 'In-home'], ['either', 'Either']], error: 'Choose online, in-home, or either.',
    suburbLabel: 'Suburb for in-home lessons', suburbHint: `In-home covers Sydney. ${AGENCY.serviceArea.inHomeFocus} are best covered.`, suburbError: 'Tell us the suburb for in-home lessons.',
  },
  focus: {
    legend: 'What is the main goal?', hint: 'Optional, but it helps us pick the right tutor.',
    labels: Object.fromEntries(NEEDS.map((n) => [n.key, n.label])) as Record<NeedKey, string>,
  },
  contact: {
    legend: 'How do we reach you?', name: 'Your name', nameError: 'Enter your name.', student: "Student's first name", optional: '(optional)',
    email: 'Email', emailError: 'Enter a valid email address.', phone: 'Phone', phoneError: 'Enter a valid phone number.',
    message: 'Anything else', messagePlaceholder: 'Current marks, what is going wrong, preferred days and times, anything that helps us choose well.',
    consent: 'By sending, you agree to our privacy policy. Your details are used to match a tutor and are shared only with the tutor we match.', privacyLink: 'privacy policy',
  },
  buttons: { back: 'Back', next: 'Continue', send: 'Send enquiry', sending: 'Sending', home: 'Back to home' },
  done: {
    kicker: 'Enquiry sent',
    heading: (first) => `Thanks, ${first}.`,
    body: (email) => `A confirmation is on its way to ${email}. ${AGENCY.founder.firstName} will reply within ${AGENCY.policies.replyWithinHours} hours with a suggested tutor and next steps.`,
    sooner: 'Prefer to talk sooner? Email',
  },
  serverError: `Something went wrong on our side. Please email ${AGENCY.email} and we will sort it out.`,
  genericError: `Something went wrong. Please email ${AGENCY.email} instead.`,
};

export const ENQUIRY_COPY_ES: EnquiryCopy = {
  lang: 'es',
  steps: ['Quién', 'Año', 'Materias', 'Clases', 'Objetivo', 'Contacto'],
  who: { legend: '¿Quién necesita clases?', options: [['my_child', 'Mi hijo o hija'], ['me', 'Yo'], ['someone_else', 'Otra persona']], error: 'Elige una opción.' },
  year: { legend: '¿En qué año escolar está?', error: 'Elige el año escolar.', university: 'Universidad', other: 'Otro' },
  subjects: {
    legend: '¿Qué materias?', hint: 'Elige todas las que necesites.', error: 'Elige al menos una materia.',
    notListed: '¿Necesitas algo que no aparece aquí? Escríbelo en el último paso y te diremos con franqueza si podemos ayudar.',
    tiers: { core: 'Matemáticas y ciencias', request: 'Otras materias del HSC, a pedido', ib: 'Bachillerato Internacional (IB)' },
    labels: {
      maths_7_10: 'Matemáticas, años 7 a 10',
      science_7_10: 'Ciencias, años 7 a 10',
      maths_standard: 'Mathematics Standard 2',
      maths_advanced: 'Mathematics Advanced',
      maths_ext1: 'Mathematics Extension 1',
      maths_ext2: 'Mathematics Extension 2',
      physics: 'Física',
      chemistry: 'Química',
      biology: 'Biología',
      english_standard: 'English Standard',
      english_advanced: 'English Advanced',
      economics: 'Economía',
      business_studies: 'Business Studies',
      legal_studies: 'Legal Studies',
      modern_history: 'Historia Moderna',
      ancient_history: 'Historia Antigua',
      ib_maths_aa: 'IB Matemáticas: Analysis and Approaches',
      ib_maths_ai: 'IB Matemáticas: Applications and Interpretation',
      ib_physics: 'IB Física',
      ib_chemistry: 'IB Química',
      ib_biology: 'IB Biología',
    },
  },
  lessons: {
    legend: '¿En línea o a domicilio?', modes: [['online', 'En línea'], ['in_home', 'A domicilio'], ['either', 'Cualquiera']], error: 'Elige en línea, a domicilio o cualquiera.',
    suburbLabel: 'Suburbio para las clases a domicilio', suburbHint: `A domicilio cubrimos Sydney. ${AGENCY.serviceArea.inHomeFocus} son las zonas mejor cubiertas.`, suburbError: 'Dinos el suburbio para las clases a domicilio.',
  },
  focus: {
    legend: '¿Cuál es el objetivo principal?', hint: 'Opcional, pero nos ayuda a elegir bien al tutor.',
    labels: {
      exam: 'Prepararse para un examen o el HSC',
      concepts: 'Entender bien los conceptos',
      confidence: 'Ganar confianza',
      keeping_up: 'Ponerse al día con la clase',
      extension: 'Adelantarse o extensión',
      unsure: 'Todavía no lo sé',
    },
  },
  contact: {
    legend: '¿Cómo te contactamos?', name: 'Tu nombre', nameError: 'Escribe tu nombre.', student: 'Nombre del estudiante', optional: '(opcional)',
    email: 'Correo electrónico', emailError: 'Escribe un correo electrónico válido.', phone: 'Teléfono', phoneError: 'Escribe un número de teléfono válido.',
    message: 'Algo más', messagePlaceholder: 'Notas actuales, qué está fallando, días y horarios preferidos, cualquier cosa que nos ayude a elegir bien.',
    consent: 'Al enviar, aceptas nuestra política de privacidad. Tus datos se usan para asignar un tutor y solo se comparten con el tutor asignado.', privacyLink: 'política de privacidad',
  },
  buttons: { back: 'Atrás', next: 'Continuar', send: 'Enviar consulta', sending: 'Enviando', home: 'Volver al inicio' },
  done: {
    kicker: 'Consulta enviada',
    heading: (first) => `Gracias, ${first}.`,
    body: (email) => `Te enviamos una confirmación a ${email}. ${AGENCY.founder.firstName} te responderá en menos de ${AGENCY.policies.replyWithinHours} horas, en español si lo prefieres, con un tutor sugerido y los siguientes pasos.`,
    sooner: '¿Prefieres hablar antes? Escribe a',
  },
  serverError: `Algo falló de nuestro lado. Escríbenos a ${AGENCY.email} y lo resolvemos.`,
  genericError: `Algo falló. Escríbenos a ${AGENCY.email}.`,
};

export function enquiryCopy(lang: EnquiryLang): EnquiryCopy {
  return lang === 'es' ? ENQUIRY_COPY_ES : ENQUIRY_COPY_EN;
}

// ---------------------------------------------------------------------------
// The call-back form. Short on purpose: a number, a year, a good time.
// ---------------------------------------------------------------------------

export type CallCopy = {
  lang: EnquiryLang;
  kicker: string;
  heading: string;
  lead: string;
  classLead: (title: string) => string;
  name: string; nameError: string;
  phone: string; phoneHint: string; phoneError: string;
  year: string; yearError: string;
  subjects: string; subjectsHint: string;
  bestTime: string;
  bestTimes: Record<BestTimeKey, string>;
  email: string; emailHint: string; emailError: string;
  suburb: string; suburbHint: string;
  message: string; messagePlaceholder: string;
  consent: string; privacyLink: string;
  send: string; sending: string;
  writeInstead: string; writeInsteadLink: string;
  done: { kicker: string; heading: (first: string) => string; body: (phone: string) => string; emailNote: (email: string) => string; classNote: (title: string) => string; home: string };
  serverError: string; genericError: string;
};

export const CALL_COPY_EN: CallCopy = {
  lang: 'en',
  kicker: 'Request a call',
  heading: 'Leave your number. Lenin calls you back.',
  lead: AGENCY.callBack.promise + ' Ten minutes on the phone is how we get the match right.',
  classLead: (title) => `You are registering interest in ${title}. Leave your number and ${AGENCY.founder.firstName} will call to confirm the day, the time and the venue.`,
  name: 'Your name', nameError: 'Enter your name.',
  phone: 'Mobile number', phoneHint: 'The number we will call.', phoneError: 'Enter the number to call.',
  year: 'Year level', yearError: 'Choose a year level.',
  subjects: 'Subjects', subjectsHint: 'Optional. Choose any that apply; we can work it out on the call.',
  bestTime: 'Best time to call',
  bestTimes: Object.fromEntries(BEST_TIMES.map((b) => [b.key, b.label])) as Record<BestTimeKey, string>,
  email: 'Email', emailHint: 'Optional. We send a note confirming the call, and use it if we cannot reach you.', emailError: 'Enter a valid email address, or leave it blank.',
  suburb: 'Suburb', suburbHint: 'Optional. Only needed for in-home lessons.',
  message: 'Anything else', messagePlaceholder: 'What is going on at school, days that suit, anything that helps.',
  consent: 'By sending, you agree to our privacy policy. Your details are used to call you back and to match a tutor, and are shared only with the tutor we match.', privacyLink: 'privacy policy',
  send: 'Request a call', sending: 'Sending',
  writeInstead: 'Prefer to write it all down?', writeInsteadLink: 'Send the full enquiry instead.',
  done: {
    kicker: 'Call request received',
    heading: (first) => `Thanks, ${first}.`,
    body: (phone) => `${AGENCY.callBack.promise} We will call ${phone}.`,
    emailNote: (email) => `We have also sent this to ${email}.`,
    classNote: (title) => `Registered interest: ${title}. The class runs once four families have confirmed.`,
    home: 'Back to home',
  },
  serverError: `Something went wrong on our side. Please email ${AGENCY.email} with your number and we will call you.`,
  genericError: `Something went wrong. Please email ${AGENCY.email} with your number and we will call you.`,
};

export const CALL_COPY_ES: CallCopy = {
  lang: 'es',
  kicker: 'Pide una llamada',
  heading: 'Deja tu número. Lenin te llama.',
  lead: 'Lenin te llamará pronto: normalmente en menos de dos horas entre las 9 am y las 8 pm, y siempre dentro de un día hábil. Diez minutos por teléfono, en español si lo prefieres, es como acertamos con el tutor.',
  classLead: (title) => `Estás registrando interés en ${title}. Deja tu número y ${AGENCY.founder.firstName} te llamará para confirmar el día, la hora y el lugar.`,
  name: 'Tu nombre', nameError: 'Escribe tu nombre.',
  phone: 'Número de móvil', phoneHint: 'El número al que llamaremos.', phoneError: 'Escribe el número al que llamar.',
  year: 'Año escolar', yearError: 'Elige el año escolar.',
  subjects: 'Materias', subjectsHint: 'Opcional. Elige las que apliquen; lo aclaramos en la llamada.',
  bestTime: 'Mejor hora para llamar',
  bestTimes: { any: 'Cualquier hora, de 9 am a 8 pm', morning: 'Mañana, de 9 am a 12 pm', afternoon: 'Tarde, de 12 pm a 5 pm', evening: 'Noche, de 5 pm a 8 pm', weekend: 'Fin de semana' },
  email: 'Correo electrónico', emailHint: 'Opcional. Te enviamos una confirmación y lo usamos si no logramos comunicarnos.', emailError: 'Escribe un correo válido o déjalo en blanco.',
  suburb: 'Suburbio', suburbHint: 'Opcional. Solo para clases a domicilio.',
  message: 'Algo más', messagePlaceholder: 'Qué está pasando en la escuela, días que convienen, cualquier cosa que ayude.',
  consent: 'Al enviar, aceptas nuestra política de privacidad. Tus datos se usan para llamarte y asignar un tutor, y solo se comparten con el tutor asignado.', privacyLink: 'política de privacidad',
  send: 'Pedir una llamada', sending: 'Enviando',
  writeInstead: '¿Prefieres escribirlo todo?', writeInsteadLink: 'Envía la consulta completa.',
  done: {
    kicker: 'Solicitud recibida',
    heading: (first) => `Gracias, ${first}.`,
    body: (phone) => `Lenin te llamará pronto al ${phone}: normalmente en menos de dos horas entre las 9 am y las 8 pm, y siempre dentro de un día hábil.`,
    emailNote: (email) => `También te lo enviamos a ${email}.`,
    classNote: (title) => `Interés registrado: ${title}. La clase empieza cuando cuatro familias confirman.`,
    home: 'Volver al inicio',
  },
  serverError: `Algo falló de nuestro lado. Escríbenos a ${AGENCY.email} con tu número y te llamamos.`,
  genericError: `Algo falló. Escríbenos a ${AGENCY.email} con tu número y te llamamos.`,
};

export function callCopy(lang: EnquiryLang): CallCopy {
  return lang === 'es' ? CALL_COPY_ES : CALL_COPY_EN;
}
