import { Outlet } from 'react-router-dom';

export default function PostadorHub() {
  return (
    <div className="flex-1 overflow-auto">
      <Outlet />
    </div>
  );
}
