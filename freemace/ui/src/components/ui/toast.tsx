import { createContext, useContext, useState, useCallback, useRef } from 'react';
import { Box, Flex, Text } from '@chakra-ui/react';
import { Check, AlertCircle, Info, X } from 'lucide-react';

type ToastType = 'success' | 'error' | 'info';

interface Toast {
  id: number;
  type: ToastType;
  message: string;
}

interface ToastContextValue {
  toast: (type: ToastType, message: string) => void;
}

const ToastContext = createContext<ToastContextValue>({ toast: () => {} });

export function useToast() {
  return useContext(ToastContext);
}

const ICONS: Record<ToastType, React.ReactNode> = {
  success: <Check size={16} />,
  error: <AlertCircle size={16} />,
  info: <Info size={16} />,
};

const COLORS: Record<ToastType, string> = {
  success: '#38a169',
  error: '#e53e3e',
  info: '#3182ce',
};

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const idRef = useRef(0);

  const addToast = useCallback((type: ToastType, message: string) => {
    const id = ++idRef.current;
    setToasts(prev => [...prev, { id, type, message }]);
    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id));
    }, 4000);
  }, []);

  const dismiss = useCallback((id: number) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  }, []);

  return (
    <ToastContext.Provider value={{ toast: addToast }}>
      {children}
      <Box
        position="fixed" bottom={4} right={4} zIndex={9999}
        display="flex" flexDirection="column" gap={2}
        maxW="400px" pointerEvents="none"
      >
        {toasts.map(t => (
          <Flex
            key={t.id}
            bg={COLORS[t.type]} color="white"
            px={4} py={3} borderRadius="md" boxShadow="lg"
            align="center" gap={2}
            pointerEvents="auto"
            animation="slideIn 0.2s ease-out"
            cursor="pointer"
            onClick={() => dismiss(t.id)}
          >
            {ICONS[t.type]}
            <Text fontSize="sm" flex={1}>{t.message}</Text>
            <X size={14} opacity={0.7} />
          </Flex>
        ))}
      </Box>
      <style>{`
        @keyframes slideIn {
          from { transform: translateX(100%); opacity: 0; }
          to   { transform: translateX(0);    opacity: 1; }
        }
      `}</style>
    </ToastContext.Provider>
  );
}
