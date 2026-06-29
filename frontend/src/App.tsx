import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import MainLayout from "./pages/MainLayout";
import BedDashboard from "./pages/BedDashboard";
import PatientDetail from "./pages/PatientDetail";
import PatientRegistration from "./pages/PatientRegistration";
import Callback from "./pages/Callback";
import Launch from "./pages/Launch";

function SmartGuard({ children }: { children: React.ReactNode }) {
  const token = sessionStorage.getItem("smart_access_token");

  if (!token) {
    return <Navigate to="/launch" replace />;
  }

  return <>{children}</>;
}

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/launch" element={<Launch />} />
        <Route path="/" element={<MainLayout />}>
          <Route index element={<SmartGuard><BedDashboard /></SmartGuard>} />
          <Route path="patient/:id" element={<SmartGuard><PatientDetail /></SmartGuard>} />
          <Route path="register" element={<SmartGuard><PatientRegistration /></SmartGuard>} />
          <Route path="callback" element={<Callback />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}

export default App;

