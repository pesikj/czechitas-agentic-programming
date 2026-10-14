// Runs before first paint (loaded synchronously in <head>): mark JavaScript support and apply
// the saved or system theme. An external file, so the Content Security Policy needs no inline script.
(function () {
  var root = document.documentElement;
  root.classList.add('js');
  var theme;
  try {
    theme = localStorage.getItem('theme');
  } catch (error) {}
  if (theme !== 'dark' && theme !== 'light') {
    theme = matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }
  if (theme === 'dark') root.setAttribute('data-webtui-theme', 'dark');
})();
