import PropTypes from 'prop-types';

import GameCard from '../GameCard/GameCard';

import css from './CatalogGrid.module.less';


const CatalogGrid = ({games, onRefresh, onSelect, signedIn, view}) => {
	const featured = games[0];
	const backdrop = featured?.images?.hero || featured?.images?.tvBanner;
	return <section className={`${css.catalog} ${view === 'home' ? css.home : css.library}`} style={{backgroundImage: `${backdrop ? `linear-gradient(90deg, rgba(11,15,26,.96) 0%, rgba(11,15,26,.72) 42%, rgba(11,15,26,.34) 100%), url(${backdrop})` : 'linear-gradient(135deg, rgba(28,37,49,.56), rgba(11,15,26,.92) 58%)'}`}}>
		<header className={css.header}>
			<div>
				<p className={css.eyebrow}>{signedIn ? 'Cloud library' : 'Preview catalog'}</p>
				<h1>{view === 'home' ? 'My games' : 'Library'}</h1>
			</div>
			{view === 'library' ? <div className={css.libraryTools}><label className={css.search}><span>Search</span><input placeholder="Search games" /></label><button className={css.filter}>Filter & sort <span>Steam · All genres · Popular</span></button><button className={css.refresh} onClick={onRefresh}>Refresh</button></div> : null}
		</header>
		{view === 'library' ? <div className={css.libraryBody}><div className={css.grid}>{games.map((game, index) => <GameCard featured={index === 0} game={game} key={game.id} onSelect={onSelect} />)}</div><aside className={css.libraryDetail}><p className={css.detailMeta}>{featured?.store || 'GeForce NOW'} / {featured?.genre || 'Cloud game'}</p><h2>{featured?.title || 'Select a game'}</h2><p>Available to play from the cloud on this TV.</p><strong>In your library</strong><button onClick={() => onSelect(featured)}>Open details &amp; play</button><button>Pin to Home</button></aside></div> : <div className={`${css.grid} ${css.homeGrid}`}>{games.map((game, index) => <GameCard featured={index === 0} game={game} home key={game.id} onSelect={onSelect} />)}</div>}
	</section>;
};

CatalogGrid.propTypes = {
	games: PropTypes.arrayOf(PropTypes.object).isRequired,
	onRefresh: PropTypes.func.isRequired,
	onSelect: PropTypes.func.isRequired,
	signedIn: PropTypes.bool.isRequired,
	view: PropTypes.string
};

export default CatalogGrid;
