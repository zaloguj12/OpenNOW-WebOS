import MoonstoneDecorator from '@enact/moonstone/MoonstoneDecorator';
import {useCallback, useEffect, useMemo, useState} from 'react';

import CatalogGrid from '../components/CatalogGrid/CatalogGrid';
import LoginView from '../components/LoginView/LoginView';
import PlayerView from '../components/PlayerView/PlayerView';
import {cancelDeviceLogin, createSession, discoverRegions, fetchCatalog, pollDeviceLogin, PROVIDERS, recoverPendingAllocation, startDeviceLogin, pollSession, stopSession} from '../gfn/gfnClient';
import {loadAuthSession, loadProvider, loadSettings, saveAuthSession, saveProvider, saveSettings} from '../gfn/storage';
import css from './App.module.less';

const DEFAULT_GAMES = [
	{id: 'fortnite', title: 'Fortnite', store: 'Epic Games', genre: 'Shooter', status: 'Ready'},
	{id: 'cyberpunk-2077', title: 'Cyberpunk 2077', store: 'Steam', genre: 'RPG', status: 'Ready'},
	{id: 'baldurs-gate-3', title: "Baldur's Gate 3", store: 'Steam', genre: 'Adventure', status: 'Ready'},
	{id: 'starfield', title: 'Starfield', store: 'Xbox', genre: 'RPG', status: 'Ready'},
	{id: 'elden-ring', title: 'Elden Ring', store: 'Steam', genre: 'Action RPG', status: 'Ready'},
	{id: 'hades', title: 'Hades', store: 'Steam', genre: 'Action', status: 'Ready'},
	{id: 'hollow-knight', title: 'Hollow Knight', store: 'Steam', genre: 'Metroidvania', status: 'Ready'},
	{id: 'stardew-valley', title: 'Stardew Valley', store: 'Steam', genre: 'Simulation', status: 'Ready'},
	{id: 'forza-horizon-5', title: 'Forza Horizon 5', store: 'Xbox', genre: 'Racing', status: 'Ready'},
	{id: 'hogwarts-legacy', title: 'Hogwarts Legacy', store: 'Steam', genre: 'Adventure', status: 'Ready'}
];
const NAV_ITEMS = [{id: 'home', label: 'Home'}, {id: 'library', label: 'Library'}, {id: 'settings', label: 'Settings'}];

const wait = (milliseconds) => new Promise((resolve) => window.setTimeout(resolve, milliseconds));

function ProviderView ({onSelect}) {
	return <section className={css.providerView}><p className={css.eyebrow}>Choose streaming provider</p><h1>Where should OpenNOW connect?</h1><p className={css.providerCopy}>Select the service used for sign-in, catalog, queue placement, and game streaming on this TV.</p><div className={css.providerList}>{PROVIDERS.map((provider) => <button className={provider.available ? css.providerOption : `${css.providerOption} ${css.providerDisabled}`} disabled={!provider.available} key={provider.code} onClick={() => onSelect(provider)}><strong>{provider.displayName}</strong><span>{provider.available ? 'Available' : 'Provider adapter not available on webOS yet'}</span></button>)}</div></section>;
}

function DetailView ({game, onBack, onPlay}) {
	const image = game.images?.hero || game.images?.tvBanner;
	return <section className={css.detail} style={{backgroundImage: `linear-gradient(90deg, #121722 8%, rgba(18, 23, 34, 0.86) 42%, rgba(18, 23, 34, 0.34)), ${image ? `url(${image})` : 'linear-gradient(135deg, #202832, #111620)'}`}}>
		<div className={css.detailContent}><button className={css.backButton} onClick={onBack}>Back</button><p className={css.eyebrow}>{game.store || 'GeForce NOW'} / {game.genre || 'Action RPG'}</p><h1>{game.title}</h1><p className={css.detailCopy}>An open-world cloud gaming session, ready to start on this TV.</p><p className={css.playOnLabel}>Play on</p><div className={css.platforms}><span className={css.platformActive}>{game.store || 'Steam'} <small>Owned</small></span><span>Epic Games Store <small>Not owned</small></span><span>GOG <small>Not owned</small></span></div><div className={css.detailActions}><button className={css.primaryAction} onClick={onPlay}>A&nbsp; Play</button><button className={css.secondaryAction}>Y&nbsp; Pin to Home</button><button className={css.secondaryAction}>MENU&nbsp; Library options</button></div><div className={css.detailPanel}><strong>Next launch requests</strong><span>Picture&nbsp; 1080p / 60 FPS</span><span>Region&nbsp; Auto</span><span>Controller connected</span></div></div>
	</section>;
}

function SettingsView ({regions, settings, onBitrateChange, onDiscoverRegions, onRegionChange, onResolutionChange}) {
	return <section className={css.settingsPane}><aside className={css.settingsNav}><strong>Account</strong><strong className={css.settingsActive}>Streaming</strong><strong>Video &amp; display</strong><strong>Input &amp; controllers</strong><strong>Network</strong><strong>Themes</strong><strong>Advanced</strong><strong>Recording</strong></aside><div className={css.settingsMain}><p className={css.eyebrow}>OpenNOW / TV profile</p><h1>Streaming</h1><div className={css.settingsGrid}>
		<label className={css.field}><span>Region endpoint</span><select onChange={onRegionChange} value={settings.region}><option value="">Auto / nearest server</option>{regions.map((region) => <option key={region.url} value={region.url}>{region.name}</option>)}</select><button className={css.fieldAction} onClick={onDiscoverRegions} type="button">Discover servers</button></label>
		<label className={css.field}><span>Resolution</span><select onChange={onResolutionChange} value={settings.resolution}><option value="1920x1080">1080p</option><option value="2560x1440">1440p</option><option value="3840x2160">4K</option></select></label>
		<label className={css.field}><span>Bitrate</span><input max="75" min="10" onChange={onBitrateChange} type="range" value={settings.bitrateMbps} /><strong>{settings.bitrateMbps} Mbps</strong></label>
		<div className={css.field}><span>HDR</span><strong>Not available on this webOS path</strong></div><div className={css.field}><span>Mouse, keyboard and capture</span><strong>Placeholder controls</strong></div><div className={css.field}><span>Cloud G-Sync</span><strong>Off</strong></div><div className={css.field}><span>Stats overlay on launch</span><strong>Placeholder control</strong></div>
	</div></div></section>;
}

function AppBase (props) {
	const [selectedProvider, setSelectedProvider] = useState(() => loadProvider());
	const [activeView, setActiveView] = useState(() => loadProvider() ? 'home' : 'boot');
	const [authSession, setAuthSession] = useState(() => loadAuthSession());
	const [settings, setSettings] = useState(() => loadSettings());
	const [games, setGames] = useState(DEFAULT_GAMES);
	const [regions, setRegions] = useState([]);
	const [selectedGame, setSelectedGame] = useState(null);
	const [streamState, setStreamState] = useState('idle');
	const [playerMenuOpen, setPlayerMenuOpen] = useState(false);
	const [notice, setNotice] = useState('Ready');
	const signedIn = Boolean(authSession?.tokens?.idToken || authSession?.tokens?.accessToken);
	const updateSettings = useCallback((next) => { setSettings(next); saveSettings(next); }, []);
	const refreshCatalog = useCallback(async () => {
		if (!signedIn) { setGames(DEFAULT_GAMES); setNotice('Sign in to load your catalog'); return; }
		setNotice('Loading catalog');
		try { const catalog = await fetchCatalog({authSession, region: settings.region}); setGames(catalog.length ? catalog : DEFAULT_GAMES); setNotice(`${catalog.length || DEFAULT_GAMES.length} games ready`); } catch (error) { setGames(DEFAULT_GAMES); setNotice(error.message || 'Catalog loading failed'); }
	}, [authSession, settings.region, signedIn]);
	const handleLoginComplete = useCallback((session) => { setAuthSession(session); saveAuthSession(session); setActiveView('home'); setNotice('Signed in'); }, []);
	const handleProviderSelect = useCallback((provider) => { setSelectedProvider(provider); saveProvider(provider); setActiveView(signedIn ? 'home' : 'login'); setNotice(`${provider.displayName} selected`); }, [signedIn]);
	const discoverServerRegions = useCallback(async () => { try { const discovered = await discoverRegions({authSession}); setRegions(discovered); setNotice(`${discovered.length} servers discovered`); } catch (error) { setNotice(error.message || 'Server discovery failed'); } }, [authSession]);
	const openGame = useCallback((game) => { setSelectedGame(game); setActiveView('detail'); }, []);
	const handleLaunchGame = useCallback(async (game) => {
		setSelectedGame(game); setStreamState('connecting'); setActiveView('player'); setPlayerMenuOpen(false); setNotice(`Requesting ${game.title}`);
		let activeSession = null;
		try {
			await recoverPendingAllocation({authSession, settings});
			let session = await createSession({authSession, game, settings});
			activeSession = session;
			let ready = session.phase === 'ready' || session.phase === 'streaming';
			for (let attempt = 0; attempt < 80; attempt += 1) {
				setSelectedGame((current) => current ? {...current, session} : current);
				if (session.phase === 'failed' || session.phase === 'finished') throw new Error('The cloud session could not be prepared.');
				if (session.phase === 'ready' || session.phase === 'streaming') { ready = true; break; }
				setStreamState(session.queuePosition ? 'queued' : session.phase === 'preparing' ? 'preparing' : 'connecting');
				setNotice(session.queuePosition ? `Queue position ${session.queuePosition}` : session.phase === 'preparing' ? 'Preparing cloud rig' : 'Session requested');
				await wait(1500);
				session = await pollSession({authSession, session, settings});
				activeSession = session;
			}
			if (!ready) throw new Error('The cloud session stayed in queue too long.');
			setSelectedGame((current) => current ? {...current, session} : current);
			setStreamState('connecting-stream');
			setNotice('Connecting the stream');
		} catch (error) { if (activeSession) stopSession({authSession, session: activeSession, settings}).catch(() => undefined); setStreamState('ready'); setNotice(error.message || 'Session start failed'); }
	}, [authSession, settings]);
	const exitPlayer = useCallback(async () => { const session = selectedGame?.session; setPlayerMenuOpen(false); try { await stopSession({authSession, session, settings}); } catch (error) { setNotice(error.message || 'Session cleanup failed'); } setStreamState('idle'); setSelectedGame(null); setActiveView('home'); setNotice('Session closed'); }, [authSession, selectedGame, settings]);
	const handleBack = useCallback((event) => { const code = event.keyCode || event.which; if (code !== 461 && code !== 27 && event.key !== 'Backspace' && event.key !== 'Escape') return; event.preventDefault(); if (activeView === 'player') { setPlayerMenuOpen((open) => !open); return; } if (activeView === 'detail') { setActiveView('library'); return; } if (activeView !== 'home') setActiveView('home'); }, [activeView]);
	useEffect(() => { window.addEventListener('keydown', handleBack); return () => window.removeEventListener('keydown', handleBack); }, [handleBack]);
	const visibleNav = useMemo(() => NAV_ITEMS.map((item) => ({...item, active: item.id === activeView})), [activeView]);
	const mainContent = activeView === 'boot' ? <ProviderView onSelect={handleProviderSelect} /> : activeView === 'player' ? <PlayerView game={selectedGame} menuOpen={playerMenuOpen} onCloseMenu={() => setPlayerMenuOpen(false)} onExit={exitPlayer} onStreamReady={() => { setStreamState('streaming'); setNotice(`Streaming ${selectedGame?.title || ''}`); }} state={streamState} /> : activeView === 'login' ? <LoginView authSession={authSession} onCancel={cancelDeviceLogin} onComplete={handleLoginComplete} onPoll={pollDeviceLogin} onStart={() => startDeviceLogin({provider: selectedProvider || PROVIDERS[0]})} /> : activeView === 'detail' ? <DetailView game={selectedGame} onBack={() => setActiveView('library')} onPlay={() => handleLaunchGame(selectedGame)} /> : activeView === 'settings' ? <SettingsView regions={regions} settings={settings} onBitrateChange={(event) => updateSettings({...settings, bitrateMbps: Number(event.target.value)})} onDiscoverRegions={discoverServerRegions} onRegionChange={(event) => updateSettings({...settings, region: event.target.value})} onResolutionChange={(event) => updateSettings({...settings, resolution: event.target.value})} /> : <CatalogGrid games={games} onRefresh={refreshCatalog} onSelect={openGame} signedIn={signedIn} view={activeView} />;

	const previewStatus = notice === 'Ready' ? 'EU Central · 18 ms · 21:40 · 82%' : notice;
	return <div {...props} className={css.app}><header className={css.topChrome}><div className={css.profile}><span className={css.avatar}>O</span><span>{signedIn ? 'Connected account' : 'Guest profile'}</span></div><strong>{activeView === 'boot' ? 'Provider' : activeView === 'player' ? 'Game Mode' : activeView === 'home' ? 'Home' : activeView === 'detail' ? 'Game Detail' : activeView}</strong><div className={css.statusPill}><i /> {previewStatus}</div></header><main className={css.content}>{mainContent}</main>{activeView !== 'player' && activeView !== 'boot' && <footer className={css.bottomChrome}><span className={css.hint}>LB/RB Navigate</span><nav className={css.navPill}>{visibleNav.map((item) => <button className={item.active ? css.navActive : ''} data-view={item.id} key={item.id} onClick={() => setActiveView(item.id)}><span className={css.navIcon}>{item.id === 'home' ? '⌂' : item.id === 'library' ? '▦' : '☼'}</span>{item.label}</button>)}<button onClick={() => setActiveView('login')}><span className={css.navIcon}>◉</span>{signedIn ? 'Account' : 'Sign in'}</button></nav><span className={css.hint}>A Select &nbsp; B Back</span></footer>}</div>;
}

export default MoonstoneDecorator(AppBase);
