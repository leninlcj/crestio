import Link from 'next/link';
import { AgencyPage, Section } from '../components/agency/AgencyPage';
import { EnquiryForm } from '../components/agency/EnquiryForm';
import { RequestCallForm } from '../components/agency/RequestCallForm';
import { AGENCY, RATE_CARD, formatRate } from '../lib/agency';
import { agencyOrganizationSchema, breadcrumb } from '../lib/agencySchema';

// Spanish landing page for Latin American and Spanish-speaking families in
// Sydney. The founder is a native Spanish speaker, so everything promised
// here (a reply in Spanish, the consultation in Spanish) is real.

const PASOS = [
  ['Cuéntanos qué necesitan', 'Año escolar, materia y si prefieren clases en línea o en casa. El formulario toma dos minutos, y puedes escribirlo en español.'],
  ['Elegimos al tutor', 'Elegimos a mano un tutor para esa materia y ese estudiante: entrevistado, con identidad verificada y con el Working With Children Check comprobado. Nunca un nombre al azar de una lista.'],
  ['Primera clase garantizada', 'Si la primera clase no encaja, cambiamos de tutor o te devolvemos esa clase. Sin conversaciones incómodas.'],
  ['El mismo tutor cada semana', 'Te quedas con el tutor que funciona. Recibes una nota escrita después de cada clase, y solo cambiamos algo cuando tú lo pides.'],
];

const POR_QUE = [
  ['Hablamos tu idioma', `${AGENCY.founder.name}, el fundador, es hispanohablante nativo. La consulta, los correos y cualquier duda sobre el sistema escolar de NSW pueden ser en español. Las clases son en inglés, como la escuela. Si quieres un tutor que también hable español, pídelo en la consulta: no siempre es posible, y te lo decimos con franqueza.`],
  ['Tutores verificados', 'Cada tutor es mayor de 18 años, fue entrevistado, mostró identificación y tiene un Working With Children Check de NSW que verificamos antes de que conozca a tu hijo.'],
  ['Precios claros, sin permanencia', 'Las tarifas están publicadas. Pagas después de cada clase con tarjeta, o en bloques prepagados. Sin cuota de inscripción y sin contrato.'],
  ['En casa o en línea', 'Clases en tu casa (Sydney), en una biblioteca local, o en línea desde cualquier lugar de Australia. Puedes cambiar cuando quieras.'],
];

const PREGUNTAS = [
  { q: '¿Las clases son en español o en inglés?', a: 'Las clases son en inglés, porque los exámenes y la escuela son en inglés, y el objetivo es que el estudiante rinda ahí. Si prefieres un tutor que también hable español, pídelo en la consulta y te decimos con franqueza si tenemos uno disponible. La comunicación contigo puede ser toda en español.' },
  { q: '¿Cómo funciona el sistema escolar de NSW para matemáticas y física?', a: 'En los años 7 a 10 hay una sola matemática con distintos niveles. En los años 11 y 12 (el HSC) el estudiante elige entre Mathematics Standard 2, Advanced, Extension 1 y Extension 2, y Física es una materia aparte. En la consulta te explicamos qué curso conviene y qué exige cada uno.' },
  { q: '¿Cuánto cuesta?', a: `Las tarifas son por hora y son el precio completo: desde $${RATE_CARD[0].online} en línea y $${RATE_CARD[0].inHome} en casa para los años 7 a 10. No hay cuota de inscripción ni cargos extra. La primera clase está garantizada.` },
  { q: '¿Qué pasa si el tutor no encaja?', a: 'Si la primera clase con un tutor nuevo no encaja, te asignamos otro tutor o te devolvemos esa clase. Solo avísanos antes de la segunda clase.' },
  { q: '¿Cómo pago?', a: 'Con tarjeta, después de cada clase, a través de un enlace de pago seguro. O en bloques prepagados si lo prefieres. Nunca se cobra nada a tu tarjeta sin tu autorización.' },
];

export default function EspanolPage() {
  return (
    <AgencyPage
      title="Tutorías de matemáticas y física en Sydney, en español"
      noSuffix
      description="Clases particulares de matemáticas y física para los años 7 a 12 y el HSC, en casa en Sydney o en línea. Atención en español. Tutores entrevistados y verificados. Primera clase garantizada."
      path="/es"
      lang="es"
      alternates={[{ hrefLang: 'es', path: '/es' }, { hrefLang: 'en-AU', path: '/' }, { hrefLang: 'x-default', path: '/' }]}
      ogTitle="Tutorías de matemáticas y física en Sydney, en español."
      ogSubtitle="Años 7 a 12 y el HSC. En casa o en línea. Atención en español."
      jsonLd={[agencyOrganizationSchema(), breadcrumb([{ name: 'Inicio', url: '/' }, { name: 'Español', url: '/es' }])]}
    >
      <section className="px-6 md:px-12 pt-14 md:pt-20 pb-6 max-w-6xl mx-auto">
        <div className="max-w-2xl">
          <div className="text-2xs uppercase tracking-widest text-ink-soft mb-4">Sydney y en línea · Matemáticas y física · Años 7 a 12</div>
          <h1 className="font-display text-4xl md:text-6xl tracking-tighter text-ink text-balance leading-[1.05] mb-5">El tutor correcto para tu hijo, con atención en español.</h1>
          <p className="text-base md:text-lg text-ink-muted leading-relaxed mb-7">
            Clases particulares de matemáticas y física, de los años 7 a 12 y el HSC, en tu casa en Sydney o en línea. Cada tutor fue entrevistado, mostró identificación y tiene el Working With Children Check verificado antes de conocer a tu hijo. Y si prefieres explicarnos todo en español, aquí te entendemos.
          </p>
          <div className="flex flex-col sm:flex-row gap-3">
            <a href="#consulta" className="btn-primary px-6 w-full sm:w-auto">Pedir una llamada</a>
            <a href="#precios" className="btn-secondary px-6 w-full sm:w-auto">Ver precios</a>
          </div>
          <p className="mt-4 text-2xs text-ink-soft">Sin cuota de inscripción. Sin permanencia. Respuesta en menos de {AGENCY.policies.replyWithinHours} horas, del fundador.</p>
        </div>
      </section>

      <Section tone="surface" eyebrow="Cómo funciona" heading="De la consulta al tutor correcto, en días.">
        <ol className="grid md:grid-cols-2 lg:grid-cols-4 gap-6 md:gap-8">
          {PASOS.map(([t, b], i) => (
            <li key={t}>
              <div className="font-display text-3xl tracking-tighter text-forest mb-3">{i + 1}</div>
              <h2 className="text-base font-semibold text-ink mb-2">{t}</h2>
              <p className="text-sm text-ink-muted leading-relaxed">{b}</p>
            </li>
          ))}
        </ol>
      </Section>

      <Section eyebrow="Por qué Crestio" heading="Lo que hacemos distinto.">
        <div className="grid sm:grid-cols-2 gap-x-8 gap-y-8">
          {POR_QUE.map(([t, b]) => (
            <div key={t}>
              <h3 className="text-base font-semibold text-ink mb-1.5">{t}</h3>
              <p className="text-sm text-ink-muted leading-relaxed">{b}</p>
            </div>
          ))}
        </div>
      </Section>

      <Section id="precios" tone="surface" eyebrow="Precios" heading="Tarifas por hora, sin sorpresas." lead="Por hora, por estudiante. Es el precio completo: sin cuota de inscripción, sin cargo por reserva. Las clases en casa incluyen el traslado del tutor.">
        <div className="rounded-md border border-rule bg-cream overflow-hidden max-w-3xl">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-2xs uppercase tracking-widest text-ink-soft border-b border-rule">
                <th className="text-left font-medium px-4 md:px-5 py-3">Nivel</th>
                <th className="text-right font-medium px-4 md:px-5 py-3">En línea</th>
                <th className="text-right font-medium px-4 md:px-5 py-3">En casa</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-rule">
              {RATE_CARD.map((b) => (
                <tr key={b.key}>
                  <td className="px-4 md:px-5 py-3.5 text-ink">
                    {b.key === 'years_7_10' ? 'Matemáticas, años 7 a 10' : b.key === 'hsc' ? 'Años 11 y 12 (HSC): Standard 2, Advanced, Extension 1 y Física' : b.key === 'ext2' ? 'Mathematics Extension 2' : 'Matemáticas y física universitarias'}
                  </td>
                  <td className="px-4 md:px-5 py-3.5 text-right num tabular text-ink whitespace-nowrap">{b.online == null ? 'No' : b.fromPrice ? `desde $${b.online}` : formatRate(b.online)}</td>
                  <td className="px-4 md:px-5 py-3.5 text-right num tabular text-ink whitespace-nowrap">{b.inHome == null ? <span className="text-ink-soft">Solo en línea</span> : formatRate(b.inHome)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>

      <Section id="consulta" eyebrow="Pide una llamada" heading="Deja tu número y Lenin te llama, en español." lead="Normalmente en menos de dos horas entre las 9 am y las 8 pm, y siempre dentro de un día hábil. Diez minutos por teléfono para elegir bien al tutor. Sin costo y sin compromiso.">
        <div className="max-w-3xl">
          <RequestCallForm lang="es" />
        </div>
      </Section>

      <Section id="consulta-completa" tone="surface" eyebrow="¿Prefieres escribir?" heading="Cuéntanos qué necesita tu hijo por escrito." lead="Un formulario corto, en español. Te respondemos en menos de un día con un tutor sugerido y los siguientes pasos.">
        <div className="max-w-3xl">
          <EnquiryForm lang="es" />
        </div>
      </Section>

      <Section eyebrow="Preguntas frecuentes" heading="Lo que las familias nos preguntan." narrow>
        <div className="divide-y divide-rule border-y border-rule">
          {PREGUNTAS.map((f) => (
            <details key={f.q} className="group py-4">
              <summary className="cursor-pointer list-none flex items-start justify-between gap-4 text-base text-ink font-medium">
                <span>{f.q}</span><span className="mt-1 text-ink-soft group-open:rotate-45 transition-transform duration-150" aria-hidden>+</span>
              </summary>
              <p className="mt-3 text-sm text-ink-muted leading-relaxed">{f.a}</p>
            </details>
          ))}
        </div>
        <p className="mt-8 text-sm text-ink-muted">
          El resto del sitio está en inglés: <Link href="/how-it-works" className="text-forest underline underline-offset-2">cómo funciona</Link>, <Link href="/pricing" className="text-forest underline underline-offset-2">precios</Link>, <Link href="/child-safe" className="text-forest underline underline-offset-2">política de protección infantil</Link>. ¿Dudas? Escribe a <a className="text-forest underline underline-offset-2" href={`mailto:${AGENCY.email}`}>{AGENCY.email}</a>, en español.
        </p>
      </Section>
    </AgencyPage>
  );
}
