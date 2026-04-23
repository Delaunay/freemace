import { HashRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import {
  ChakraProvider,
  createSystem,
  defaultConfig
} from '@chakra-ui/react';
import { ColorModeProvider } from './components/ui/color-mode';
import { ToastProvider } from './components/ui/toast';
import Layout from './layout/Layout';
import { BudgetProvider } from './services/BudgetContext';
import BudgetSheet from './components/BudgetSheet';
import Settings from './components/Settings';
import './App.css';

const system = createSystem(defaultConfig);

function App() {
  return (
    <ChakraProvider value={system}>
      <ColorModeProvider>
        <ToastProvider>
          <Router>
            <BudgetProvider>
              <Layout>
                <Routes>
                  <Route path="/" element={<Navigate to="/budget/entries" replace />} />
                  <Route path="/budget" element={<Navigate to="/budget/entries" replace />} />
                  <Route path="/budget/:tab" element={<BudgetSheet />} />
                  <Route path="/settings" element={<Settings />} />
                </Routes>
              </Layout>
            </BudgetProvider>
          </Router>
        </ToastProvider>
      </ColorModeProvider>
    </ChakraProvider>
  );
}

export default App;
