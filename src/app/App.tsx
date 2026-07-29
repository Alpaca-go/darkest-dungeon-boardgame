import { Routes, Route } from 'react-router-dom';
import GameShell from '../components/layout/GameShell';
import { ROUTES } from './router';

export default function App() {
  return (
    <Routes>
      <Route element={<GameShell />}>
        {ROUTES.map((r) => (
          <Route key={r.path} path={r.path} element={r.element} />
        ))}
        <Route path="*" element={ROUTES[0].element} />
      </Route>
    </Routes>
  );
}
