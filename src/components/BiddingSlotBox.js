import React from 'react'
import BiddingSlot from './BiddingSlot'

const BiddingSlotBox = (props) => {

	const {slots, onSlotClick} = props
	return (
			<div className="row slot-row">
				{
					slots.map((entry, key) =>
							<BiddingSlot key={entry.index} 
							index={entry.index} 
							bid={entry.highestBid}
							hasChange={entry.hasChange || false}
							bidder={entry.highestBidder.firstName} 
							onSlotClick={(e)=> onSlotClick(e, entry.index + 1, entry.highestBid)} />
						)
				}
			</div>
		)
}

export default BiddingSlotBox