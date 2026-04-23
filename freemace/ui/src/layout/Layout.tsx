import React, { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { IconButton, Box } from '@chakra-ui/react';
import { ColorModeButton } from '../components/ui/color-mode';
import { Menu, X } from 'lucide-react';
import './Layout.css';

interface NavItem {
  title: string;
  href: string;
}

export const sidebarSections: { title: string; href: string; items: NavItem[] }[] = [
  {
    title: 'Budget',
    href: '/budget',
    items: [
      { title: 'Budget Sheet', href: '/budget' },
    ],
  },
  {
    title: 'Settings',
    href: '/settings',
    items: [
      { title: 'Git Backup', href: '/settings' },
    ],
  },
];

const Layout: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const location = useLocation();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  const closeMobileMenu = () => setIsMobileMenuOpen(false);

  return (
    <div className="layout">
      {/* Mobile Menu Button */}
      <Box
        position="fixed"
        top={4}
        left={4}
        zIndex={1001}
        display={{ base: 'block', md: 'none' }}
      >
        <IconButton
          aria-label="Toggle menu"
          onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
          colorScheme="orange"
          size="lg"
          borderRadius="full"
          boxShadow="lg"
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
        <div className="sidebar-nav">
          {sidebarSections.map(section => (
            <div key={section.href} className="nav-section expanded">
              <Link
                to={section.href}
                className={`nav-section-title ${location.pathname === section.href ? 'active-section' : ''}`}
                onClick={closeMobileMenu}
              >
                {section.title}
              </Link>
              <div className="nav-section-items">
                {section.items.map(item => (
                  <Link
                    key={item.href}
                    to={item.href}
                    className={`nav-item ${location.pathname === item.href ? 'active' : ''}`}
                    onClick={closeMobileMenu}
                  >
                    {item.title}
                  </Link>
                ))}
              </div>
            </div>
          ))}
        </div>
      </nav>

      <main className="main-content">
        <div className="content-wrapper">
          {children}
        </div>
      </main>

      {/* Mobile Overlay */}
      {isMobileMenuOpen && (
        <Box
          position="fixed"
          top={0}
          left={0}
          right={0}
          bottom={0}
          bg="blackAlpha.600"
          zIndex={999}
          onClick={closeMobileMenu}
          display={{ base: 'block', md: 'none' }}
        />
      )}
    </div>
  );
};

export default Layout;
