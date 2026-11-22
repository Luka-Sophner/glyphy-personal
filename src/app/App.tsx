import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { listenNativeBack, minimizeNativeApp } from '../features/native/adapter.mjs';
import { createHashRouter, RouterProvider, Route, Routes, Navigate, useLocation } from 'react-router-dom';
import { AppShell } from './AppShell';
import { SettingsPage } from '../pages/SettingsPage';
import { ProfilesPage } from '../pages/ProfilesPage';
import { BackupsPage } from '../pages/BackupsPage';
import { ProfileProvider } from '../features/profiles/ProfileContext';
import { HomePage, DictionaryPage, CategoryPage, PlaceholderPage } from '../pages/Pages';
import { GlyphGalleryPage } from '../pages/GlyphGalleryPage';
import { DiaryPage } from '../pages/DiaryPage';
import { DiaryProvider, useDiary } from '../features/diary/DiaryContext';
import { getDiaryRoute } from '../features/diary/routes';
import { DiaryPreviewModal } from '../components/DiaryPreviewModal';
import { DiaryEntryEditor } from '../components/DiaryEntryEditor';
import { DiaryGroupsModal } from '../components/DiaryGroupsModal';
import { isDiaryGroupsRoute } from '../features/diary/groups';
import { SymbolProvider } from '../features/symbols/SymbolContext';
import { GlyphProvider } from '../features/glyphs/GlyphContext';
import { getGlyphRoute } from '../features/glyphs/routes';
import { SymbolPreviewModal } from '../components/SymbolPreviewModal';
import { SymbolEditorModal } from '../components/SymbolEditorModal';
import { GlyphPreviewModal } from '../components/GlyphPreviewModal';
import { GlyphEditorModal } from '../components/GlyphEditorModal';
import { MotionConfig, AnimatePresence } from '../lib/motion';
import { NavigationMotionProvider, useNavigationMotion } from './NavigationMotion';
function Screens() {
  const currentLocation = useLocation(), navigate = useNavigate();
  useEffect(() => {
    let disposed = false, remove: (() => void) | undefined;
    void listenNativeBack(() => {
      if (currentLocation.pathname === '/') { void minimizeNativeApp(); return; }
      if ((window.history.state?.idx ?? 0) > 0) navigate(-1);
      else navigate('/');
    }).then(cleanup => { if (disposed) cleanup(); else remove = cleanup; });
    return () => { disposed = true; remove?.(); };
  }, [currentLocation.pathname, navigate]);
  const { displayedLocation: location } = useNavigationMotion();
  const glyph = getGlyphRoute(location.pathname), diary = getDiaryRoute(location.pathname), cardModal = location.pathname.startsWith('/cards/');
  const diaryGroups = isDiaryGroupsRoute(location.pathname);
  const diaryAdd = location.pathname === '/cards/new/edit' && location.state?.backgroundPath === '/diary';
  const backgroundPath = diaryGroups || diary || diaryAdd ? '/diary' : glyph ? location.state?.backgroundPath ?? '/glyphs' : cardModal ? location.state?.backgroundPath ?? '/' : location.pathname;
  return <AppShell backgroundPath={backgroundPath}>
    <Routes location={{ ...location, pathname: backgroundPath }}>
      <Route path="/" element={<HomePage />} /><Route path="/menu" element={<HomePage />} />
      <Route path="/dictionary" element={<DictionaryPage />} />
      <Route path="/category/:categoryId" element={<CategoryPage />} />
      <Route path="/glyphs" element={<GlyphGalleryPage />} />
      <Route path="/diary" element={<DiaryPage />} />
      <Route path="/settings" element={<SettingsPage />} />
      <Route path="/settings/profiles" element={<ProfilesPage />} />
      <Route path="/settings/backups" element={<BackupsPage />} />
      <Route path="*" element={<PlaceholderPage title="Страница не найдена" />} />
    </Routes>
    <AnimatePresence mode="wait" initial={false}>
      {diaryGroups ? <DiaryGroupsModal key="diary-groups" /> : diaryAdd ? <DiaryCreationRedirect key="diary-create-redirect" /> : diary ? diary.editor ? <DiaryEntryEditor key={`diary-editor-${diary.entryId}`} entryId={diary.entryId} /> : <DiaryPreviewModal key={`diary-${diary.entryId}`} entryId={diary.entryId} photoIndex={diary.photoIndex} /> : glyph ? glyph.editor ? <GlyphEditorModal key={`glyph-editor-${glyph.glyphId}`} glyphId={glyph.glyphId} />
        : <GlyphPreviewModal key={`glyph-${glyph.glyphId}`} glyphId={glyph.glyphId} symbolId={glyph.symbolId} />
        : cardModal && <Routes key={location.pathname} location={location}><Route path="/cards/:cardId/edit" element={<SymbolEditorModal />} />
          <Route path="/cards/:cardId" element={<SymbolPreviewModal />} /><Route path="*" element={null} /></Routes>}
    </AnimatePresence>
  </AppShell>;
}
function DiaryCreationRedirect() {
  const location = useLocation();
  const { rootView } = useDiary();
  return <Navigate to="/diary/new/edit" replace state={{ ...location.state, backgroundPath: '/diary', diaryEditorFrom: `/diary${rootView.search}`, diaryBackgroundSearch: rootView.search, diaryInitialGroupId: rootView.groupId }} />;
}
const router = createHashRouter([{ path: '*', element: <MotionConfig reducedMotion="user"><ProfileProvider><SymbolProvider><GlyphProvider><DiaryProvider><NavigationMotionProvider><Screens /></NavigationMotionProvider></DiaryProvider></GlyphProvider></SymbolProvider></ProfileProvider></MotionConfig> }]);
export function App() { return <RouterProvider router={router} />; }
