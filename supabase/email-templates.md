# Crestio — Supabase email templates

These templates replace the generic Supabase default emails with branded ones matching your product. They are not auto-deployed; you paste them into the Supabase dashboard once.

## Where they go

Supabase Dashboard → Authentication → Email Templates.

There are four templates to update. Each has a subject line and an HTML body. Copy the exact text below into each field, then click **Save** at the bottom.

---

## Template 1 — Confirm signup

**Subject heading:**

```
Confirm your Crestio account
```

**Message body (HTML mode):**

```html
<table style="max-width:520px;margin:0 auto;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;color:#1A1815;padding:32px 24px;">
  <tr><td>
    <div style="font-family:Georgia,serif;font-size:28px;font-weight:500;letter-spacing:-0.04em;margin-bottom:32px;">
      crest<span style="font-style:italic;color:#1F3A2E;">io</span>
    </div>
    <h1 style="font-family:Georgia,serif;font-size:28px;font-weight:500;letter-spacing:-0.03em;line-height:1.15;margin:0 0 16px;">Confirm your account</h1>
    <p style="font-size:15px;line-height:1.55;color:#6B6660;margin:0 0 24px;">
      Click the button below to finish setting up your Crestio account. If you didn't sign up, ignore this email and nothing will happen.
    </p>
    <p style="margin:0 0 32px;">
      <a href="{{ .ConfirmationURL }}" style="display:inline-block;background:#1F3A2E;color:#FAF8F4;padding:12px 20px;text-decoration:none;border-radius:4px;font-weight:500;font-size:14px;">Confirm email</a>
    </p>
    <p style="font-size:13px;line-height:1.55;color:#908A82;margin:0 0 24px;">
      Or paste this link into your browser: <br><span style="color:#1F3A2E;word-break:break-all;">{{ .ConfirmationURL }}</span>
    </p>
    <hr style="border:none;border-top:1px solid #E8E3DB;margin:32px 0;">
    <p style="font-size:12px;color:#908A82;margin:0;">crestio · Sydney · <a href="mailto:hello@crestio.app" style="color:#908A82;">hello@crestio.app</a></p>
  </td></tr>
</table>
```

---

## Template 2 — Reset password

**Subject heading:**

```
Reset your Crestio password
```

**Message body (HTML mode):**

```html
<table style="max-width:520px;margin:0 auto;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;color:#1A1815;padding:32px 24px;">
  <tr><td>
    <div style="font-family:Georgia,serif;font-size:28px;font-weight:500;letter-spacing:-0.04em;margin-bottom:32px;">
      crest<span style="font-style:italic;color:#1F3A2E;">io</span>
    </div>
    <h1 style="font-family:Georgia,serif;font-size:28px;font-weight:500;letter-spacing:-0.03em;line-height:1.15;margin:0 0 16px;">Reset your password</h1>
    <p style="font-size:15px;line-height:1.55;color:#6B6660;margin:0 0 24px;">
      Click the button below to set a new password. This link expires in one hour. If you didn't ask to reset it, ignore this email.
    </p>
    <p style="margin:0 0 32px;">
      <a href="{{ .ConfirmationURL }}" style="display:inline-block;background:#1F3A2E;color:#FAF8F4;padding:12px 20px;text-decoration:none;border-radius:4px;font-weight:500;font-size:14px;">Set new password</a>
    </p>
    <p style="font-size:13px;line-height:1.55;color:#908A82;margin:0 0 24px;">
      Or paste this link into your browser: <br><span style="color:#1F3A2E;word-break:break-all;">{{ .ConfirmationURL }}</span>
    </p>
    <hr style="border:none;border-top:1px solid #E8E3DB;margin:32px 0;">
    <p style="font-size:12px;color:#908A82;margin:0;">crestio · Sydney · <a href="mailto:hello@crestio.app" style="color:#908A82;">hello@crestio.app</a></p>
  </td></tr>
</table>
```

---

## Template 3 — Magic link

**Subject heading:**

```
Your Crestio sign-in link
```

**Message body (HTML mode):**

```html
<table style="max-width:520px;margin:0 auto;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;color:#1A1815;padding:32px 24px;">
  <tr><td>
    <div style="font-family:Georgia,serif;font-size:28px;font-weight:500;letter-spacing:-0.04em;margin-bottom:32px;">
      crest<span style="font-style:italic;color:#1F3A2E;">io</span>
    </div>
    <h1 style="font-family:Georgia,serif;font-size:28px;font-weight:500;letter-spacing:-0.03em;line-height:1.15;margin:0 0 16px;">Sign in to Crestio</h1>
    <p style="font-size:15px;line-height:1.55;color:#6B6660;margin:0 0 24px;">
      Click the button to sign in. Link expires in one hour.
    </p>
    <p style="margin:0 0 32px;">
      <a href="{{ .ConfirmationURL }}" style="display:inline-block;background:#1F3A2E;color:#FAF8F4;padding:12px 20px;text-decoration:none;border-radius:4px;font-weight:500;font-size:14px;">Sign in</a>
    </p>
    <hr style="border:none;border-top:1px solid #E8E3DB;margin:32px 0;">
    <p style="font-size:12px;color:#908A82;margin:0;">crestio · Sydney · <a href="mailto:hello@crestio.app" style="color:#908A82;">hello@crestio.app</a></p>
  </td></tr>
</table>
```

---

## Template 4 — Change email address

**Subject heading:**

```
Confirm your new Crestio email
```

**Message body (HTML mode):**

```html
<table style="max-width:520px;margin:0 auto;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;color:#1A1815;padding:32px 24px;">
  <tr><td>
    <div style="font-family:Georgia,serif;font-size:28px;font-weight:500;letter-spacing:-0.04em;margin-bottom:32px;">
      crest<span style="font-style:italic;color:#1F3A2E;">io</span>
    </div>
    <h1 style="font-family:Georgia,serif;font-size:28px;font-weight:500;letter-spacing:-0.03em;line-height:1.15;margin:0 0 16px;">Confirm your new email</h1>
    <p style="font-size:15px;line-height:1.55;color:#6B6660;margin:0 0 24px;">
      You asked to change your email. Click the button to confirm the new address. If you didn't make this change, change your password immediately.
    </p>
    <p style="margin:0 0 32px;">
      <a href="{{ .ConfirmationURL }}" style="display:inline-block;background:#1F3A2E;color:#FAF8F4;padding:12px 20px;text-decoration:none;border-radius:4px;font-weight:500;font-size:14px;">Confirm new email</a>
    </p>
    <hr style="border:none;border-top:1px solid #E8E3DB;margin:32px 0;">
    <p style="font-size:12px;color:#908A82;margin:0;">crestio · Sydney · <a href="mailto:hello@crestio.app" style="color:#908A82;">hello@crestio.app</a></p>
  </td></tr>
</table>
```

---

## One more setting worth changing

While you're in Supabase, go to **Authentication → URL Configuration**.

- **Site URL**: set to your production URL (`https://crestio.vercel.app` for now, or your custom domain once you have one — it needs to be whichever one users actually land on)
- **Redirect URLs**: add these three, one per line:
  - `https://crestio.vercel.app/**`
  - `https://crestio.app/**` (if/when you buy the domain)
  - `http://localhost:3000/**` (so local development still works)

This ensures the password reset and email confirmation links in the emails actually route back to your app, not Supabase's default page.
