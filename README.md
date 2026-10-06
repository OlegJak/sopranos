# Soprano Studio

**Website: https://olegjak.github.io/sopranos/**

Website for Soprano Studio (SOPRANOS OÜ), a cosmetology and laser studio at Rakvere 19, Jõhvi.

A single static page (`index.html`) in Estonian and Russian, with images in `img/`. No build step: open `index.html` or serve the folder with any static host.

## Question form

The "Ask us" form sends messages to the studio e-mail through [FormSubmit](https://formsubmit.co). The first submission triggers an activation e-mail to that address; confirm it once and later messages arrive normally. The address is set in `FORM_ENDPOINT` inside `index.html`.
