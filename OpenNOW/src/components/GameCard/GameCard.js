import PropTypes from 'prop-types';
import {useCallback} from 'react';

import css from './GameCard.module.less';

const GameCard = ({game, featured, home, onSelect}) => {
	const handleSelect = useCallback(() => {
		onSelect(game);
	}, [game, onSelect]);

	return (
		<article className={`${css.card} ${featured ? css.featured : ''} ${home ? css.homeCard : ''}`} onClick={handleSelect} onKeyDown={(event) => {
			if (event.key === 'Enter' || event.key === ' ') handleSelect();
		}} role="button" tabIndex="0">
			<div className={`${css.art} ${game.store === 'Xbox' ? css.artXbox : game.store === 'Epic Games' ? css.artEpic : css.artSteam}`} style={game.images?.hero || game.images?.keyArt ? {backgroundImage: `url(${game.images.hero || game.images.keyArt})`} : undefined}>
				{!game.images?.hero && !game.images?.keyArt && <span>{game.title}</span>}
			</div>
			<div className={css.body}>
				<p>{game.store || 'GeForce NOW'} <span className={css.dot}>/</span> {game.genre || 'Cloud game'}</p>
				<h2>{game.title}</h2>
				<div className={css.meta}><strong>{game.status || 'Available'}</strong><span>Press OK</span></div>
			</div>
		</article>
	);
};

GameCard.propTypes = {
	game: PropTypes.shape({
		genre: PropTypes.string,
		id: PropTypes.oneOfType([PropTypes.number, PropTypes.string]).isRequired,
		status: PropTypes.string,
		store: PropTypes.string,
		title: PropTypes.string.isRequired
	}).isRequired,
	featured: PropTypes.bool,
	onSelect: PropTypes.func.isRequired
};

export default GameCard;
