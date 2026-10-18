import './styles.css';
import './layout.css';

if (__DEV__ && new URLSearchParams(location.search).has('direction')) {
  const { renderDirections } = await import('./directions.mjs');
  renderDirections();
} else if (__DEV__ && new URLSearchParams(location.search).has('fixture')) {
  const { renderFixture } = await import('./fixture.mjs');
  renderFixture();
} else {
  const { startApp } = await import('./app.mjs');
  startApp();
}
