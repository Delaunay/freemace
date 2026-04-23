import React, { useState, useEffect } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { IconButton, Box, Flex, Text } from '@chakra-ui/react';
import { ColorModeButton } from '../components/ui/color-mode';
import { Menu, X, ChevronDown, Bug } from 'lucide-react';
import { useBudget } from '../services/BudgetContext';
import './Layout.css';

const BUDGET_TABS = [
  { id: 'entries',  label: 'Entries' },
  { id: 'summary',  label: 'Summary' },
  { id: 'tax',      label: 'Tax Summary' },
  { id: 'types',    label: 'Types' },
  { id: 'from',     label: 'From' },
  { id: 'bank',     label: 'Bank' },
  { id: 'details',  label: 'Details' },
];

const Layout: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const location = useLocation();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [yearOpen, setYearOpen] = useState(false);
  const { fileName, setFileName, fileList, refreshFileList } = useBudget();

  const closeMobileMenu = () => setIsMobileMenuOpen(false);

  useEffect(() => { refreshFileList(); }, [refreshFileList]);

  const isBudgetRoute = location.pathname.startsWith('/budget');
  const currentTab = location.pathname.split('/')[2] || 'entries';

  const selectFile = (f: string) => {
    setFileName(f);
    setYearOpen(false);
  };


  return (
    <div className="layout">
      <Box
        position="fixed" top={4} left={4} zIndex={1001}
        display={{ base: 'block', md: 'none' }}
      >
        <IconButton
          aria-label="Toggle menu"
          onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
          colorScheme="orange" size="lg" borderRadius="full" boxShadow="lg"
        >
          {isMobileMenuOpen ? <X size={24} /> : <Menu size={24} />}
        </IconButton>
      </Box>

      <nav className={`sidebar ${isMobileMenuOpen ? 'mobile-open' : ''}`}>
        <div className="sidebar-header">
          <h1 className="sidebar-title">
            <Link to="/" style={{ textDecoration: 'none', color: 'inherit' }} onClick={closeMobileMenu}>
              FreeMace
            </Link>
          </h1>
          <ColorModeButton />
        </div>

        {/* Tax Year Selector */}
        <div className="year-selector">
          <Flex className="year-selector-toggle" align="center" justify="space-between" onClick={() => setYearOpen(!yearOpen)}>
            <Text fontSize="xs" fontWeight="bold" textTransform="uppercase" letterSpacing="0.05em" color="gray.500">
              Tax Year
            </Text>
            <Flex align="center" gap={1}>
              <Text fontSize="md" fontWeight="bold">{fileName}</Text>
              <ChevronDown size={14} className={yearOpen ? 'chevron-open' : ''} />
            </Flex>
          </Flex>
          {yearOpen && (
            <div className="year-dropdown">
              {[...fileList].sort().reverse().map(f => (
                <div
                  key={f}
                  className={`year-option ${f === fileName ? 'active' : ''}`}
                  onClick={() => selectFile(f)}
                >
                  {f}
                </div>
              ))}
              <div className="year-new">
                <input
                  placeholder="New year…"
                  className="year-new-input"
                  onKeyDown={e => {
                    if (e.key === 'Enter') {
                      const v = (e.target as HTMLInputElement).value.trim();
                      if (v) { selectFile(v); (e.target as HTMLInputElement).value = ''; }
                    }
                  }}
                />
              </div>
            </div>
          )}
        </div>

        <div className="sidebar-nav">
          {/* Budget section */}
          <div className={`nav-section expanded`}>
            <Link
              to="/budget/entries"
              className={`nav-section-title ${isBudgetRoute ? 'active-section' : ''}`}
              onClick={closeMobileMenu}
            >
              Budget
            </Link>
            <div className="nav-section-items">
              {BUDGET_TABS.map(tab => (
                <Link
                  key={tab.id}
                  to={`/budget/${tab.id}`}
                  className={`nav-item ${isBudgetRoute && currentTab === tab.id ? 'active' : ''}`}
                  onClick={closeMobileMenu}
                >
                  {tab.label}
                </Link>
              ))}
            </div>
          </div>

          {/* Settings section */}
          <div className={`nav-section expanded`}>
            <Link
              to="/settings/git"
              className={`nav-section-title ${location.pathname.startsWith('/settings') ? 'active-section' : ''}`}
              onClick={closeMobileMenu}
            >
              Settings
            </Link>
            <div className="nav-section-items">
              <Link
                to="/settings/git"
                className={`nav-item ${location.pathname === '/settings/git' ? 'active' : ''}`}
                onClick={closeMobileMenu}
              >
                Git Backup
              </Link>
              <Link
                to="/settings/updates"
                className={`nav-item ${location.pathname === '/settings/updates' ? 'active' : ''}`}
                onClick={closeMobileMenu}
              >
                Software Updates
              </Link>
            </div>
          </div>

          {/* Report a bug */}
          <div className="nav-section" style={{ marginTop: 'auto' }}>
            <a
              href="https://github.com/Delaunay/freemace/issues/new"
              target="_blank"
              rel="noopener noreferrer"
              className="nav-section-title"
              onClick={closeMobileMenu}
            >
              <Flex align="center" gap={2}><Bug size={16} /> Bugs</Flex>
            </a>
          </div>
        </div>
      </nav>

      <main className="main-content">
        <div className="content-wrapper">
          {children}
        </div>
      </main>

      {isMobileMenuOpen && (
        <Box
          position="fixed" top={0} left={0} right={0} bottom={0}
          bg="blackAlpha.600" zIndex={999}
          onClick={closeMobileMenu}
          display={{ base: 'block', md: 'none' }}
        />
      )}
    </div>
  );
};

export default Layout;
