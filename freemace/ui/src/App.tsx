import { HashRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import {
  ChakraProvider,
  createSystem,
  defaultConfig
} from '@chakra-ui/react';
import { ColorModeProvider } from './components/ui/color-mode';
import Layout from './layout/Layout';
import BudgetSheet from './components/BudgetSheet';
import './App.css';

const system = createSystem(defaultConfig);

function App() {
  return (
    <ChakraProvider value={system}>
      <ColorModeProvider>
        <Router>
          <Layout>
            <Routes>
              <Route path="/" element={<Navigate to="/budget" replace />} />
              <Route path="/budget" element={<BudgetSheet />} />
            </Routes>
          </Layout>
        </Router>
      </ColorModeProvider>
    </ChakraProvider>
  );
}

export default App;
