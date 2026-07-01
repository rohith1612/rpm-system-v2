import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import Shell from "./components/Shell";
import IcuFloor from "./pages/IcuFloor";
import PatientMonitor from "./pages/PatientMonitor";

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Shell />}>
          <Route index element={<IcuFloor />} />
          <Route path="patient/:id" element={<PatientMonitor />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}

export default App;
