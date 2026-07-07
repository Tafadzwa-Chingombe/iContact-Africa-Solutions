// iContact Africa Solutions — shared site behaviour

document.addEventListener('DOMContentLoaded', () => {
  // Mobile nav toggle
  const navToggle = document.querySelector('.nav-toggle');
  const navLinks = document.querySelector('.nav-links');

  if (navToggle && navLinks) {
    navToggle.addEventListener('click', () => {
      navToggle.classList.toggle('open');
      navLinks.classList.toggle('open');
    });

    navLinks.querySelectorAll('a').forEach((link) => {
      link.addEventListener('click', () => {
        navToggle.classList.remove('open');
        navLinks.classList.remove('open');
      });
    });
  }

  // FAQ accordion
  document.querySelectorAll('.faq-item').forEach((item) => {
    const question = item.querySelector('.faq-question');
    if (!question) return;
    question.addEventListener('click', () => {
      const isOpen = item.classList.contains('open');
      item.closest('.faq-list')
        .querySelectorAll('.faq-item')
        .forEach((el) => {
          el.classList.remove('open');
          el.querySelector('.faq-question .icon').textContent = '+';
        });
      if (!isOpen) {
        item.classList.add('open');
        question.querySelector('.icon').textContent = '–';
      }
    });
  });

  // Footer year
  document.querySelectorAll('.current-year').forEach((el) => {
    el.textContent = new Date().getFullYear();
  });

  // Contact form (static hosting — no backend, so just confirm client-side)
  const contactForm = document.querySelector('.contact-form form');
  if (contactForm) {
    contactForm.addEventListener('submit', (e) => {
      e.preventDefault();
      const success = document.querySelector('.form-success');
      if (success) {
        success.classList.add('visible');
      }
      contactForm.reset();
    });
  }
});
