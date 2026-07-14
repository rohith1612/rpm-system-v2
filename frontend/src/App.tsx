import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import Shell from "./components/Shell";
import IcuFloor from "./pages/IcuFloor";
import PatientMonitor from "./pages/PatientMonitor";
import PatientHistory from "./pages/PatientHistory";
import Launch from "./pages/Launch";
import Callback from "./pages/Callback";
import { WebSocketProvider } from "./hooks/useWebSocket";

function App() {
  return (
    <BrowserRouter>
      <WebSocketProvider>
        <Routes>
          <Route path="/launch" element={<Launch />} />
          <Route path="/callback" element={<Callback />} />
          <Route path="/" element={<Shell />}>
            <Route index element={<IcuFloor />} />
            <Route path="patient/:id" element={<PatientMonitor />} />
            <Route path="patient/:id/history" element={<PatientHistory />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Route>
        </Routes>
      </WebSocketProvider>
    </BrowserRouter>
  );
}

export default App;

