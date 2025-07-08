/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { initDashboardPage } from './dashboard';
import { initMaterialPage } from './material';
import { initCashflowPage } from './cashflow';
import { unregisterAndReload } from './serviceWorkerManager';

document.addEventListener('DOMContentLoaded', () => {
  // --- UNREGISTER SERVICE WORKER ---
  // This is a special fix to address issues where a "ghost" service worker
  // might be caching old files, preventing updates from appearing.
  unregisterAndReload();

  // --- DOM ELEMENT SELECTION ---
  const navLinks = document.querySelectorAll('.nav-link');
  const pageContents = document.querySelectorAll('.page-content');
  const menuToggle = document.getElementById('menu-toggle');
  const sidebar = document.getElementById('sidebar');
  const overlay = document.getElementById('overlay');
  const sidebarCloseBtn = document.getElementById('sidebar-close-btn');
  const navMenu = document.querySelector('.nav-menu');

  // --- UI FUNCTIONS ---
  const closeSidebar = () => {
    if (!sidebar || !overlay || !menuToggle) return;
    sidebar.classList.remove('open');
    overlay.classList.remove('active');
    menuToggle.classList.remove('active');
    menuToggle.setAttribute('aria-label', 'Open menu');
  };

  // --- PAGE ROUTING/INITIALIZATION ---
  const pageInitializers: { [key: string]: () => void } = {
    'dashboard': initDashboardPage,
    'material': initMaterialPage,
    'cashflow': initCashflowPage,
  };

  const showPage = (targetId: string) => {
    pageContents.forEach(page => {
        page.classList.remove('active');
        if (page.id === targetId) {
          page.classList.add('active');
          // Initialize page-specific logic
          if (pageInitializers[targetId]) {
            pageInitializers[targetId]();
          }
        }
      });
  }

  // --- EVENT LISTENERS & INITIALIZATION ---
  
  // Sidebar & Nav
  if (menuToggle && sidebar && overlay && sidebarCloseBtn) {
    menuToggle.addEventListener('click', (e) => {
      e.stopPropagation();
      const isOpen = sidebar.classList.toggle('open');
      menuToggle.classList.toggle('active', isOpen);
      menuToggle.setAttribute('aria-label', isOpen ? 'Close menu' : 'Open menu');
      
      if (window.matchMedia('(max-width: 768px)').matches) {
          overlay.classList.toggle('active', isOpen);
      }
    });
    
    sidebarCloseBtn.addEventListener('click', closeSidebar);
    overlay.addEventListener('click', closeSidebar);
  }

  if (navMenu) {
    navMenu.addEventListener('click', (e) => {
      const target = e.target as HTMLElement;
      const navLink = target.closest('.nav-link');

      if (!navLink) return;
      e.preventDefault();

      const targetId = navLink.getAttribute('data-target');
      if (!targetId) return;

      navLinks.forEach(link => link.classList.remove('active'));
      navLink.classList.add('active');
      
      showPage(targetId);
      closeSidebar();
    });
  }

  // Initial Page Load
  const initialActiveLink = document.querySelector('.nav-link.active');
  if (initialActiveLink) {
    const targetId = initialActiveLink.getAttribute('data-target');
    if (targetId) {
        showPage(targetId);
    }
  }
});