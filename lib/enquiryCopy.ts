// Every string the enquiry form shows, in English and Spanish. Subject,
// year-level and goal options keep their keys from lib/agency.ts; only the
// labels are translated. Anything not translated falls back to English.

import { AGENCY, NEEDS, SUBJECTS, type SubjectKey, type NeedKey } from './agency';

export type EnquiryLang = 'en' | 'es';

export type EnquiryCopy = {
  lang: EnquiryLang;
  steps: [string, string, string, string, string, string];
  who: { legend: string; options: Array<[('my_child' | 'me' | 'someone_else'), string]>; error: string };
  year: { legend: string; error: string; university: string; other: string };
  subjects: { legend: string; hint: string; error: string; notListed: string; labels: Record<SubjectKey, string> };
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
    notListed: 'Need something not listed? Mention it on the last step and we will tell you honestly whether we can help.',
    labels: Object.fromEntries(SUBJECTS.map((s) => [s.key, s.label])) as Record<SubjectKey, string>,
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
    labels: {
      maths_7_10: 'Matemáticas, años 7 a 10',
      maths_standard: 'Mathematics Standard 2',
      maths_advanced: 'Mathematics Advanced',
      maths_ext1: 'Mathematics Extension 1',
      maths_ext2: 'Mathematics Extension 2',
      physics: 'Física',
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
