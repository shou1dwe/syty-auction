import { connect } from 'react-redux'
import BiddingForm from '../components/BiddingForm'
import { fetchBid } from '../actions'

function mapStateToProps(state, ownProps) {
  return {
    bidRequested: false, // TODO
    initialValues: {slot: ownProps.slot, amount: state.interaction.bidAmount},
    bidAmount: state.interaction.bidAmount
  };
}

function mapDispatchToProps() {
  return {
    onSubmit: (values, dispatch) => {
    	dispatch(fetchBid(values.slot, 	values.amount));
    }
  };
}

export default connect(
  mapStateToProps,
  mapDispatchToProps
)(BiddingForm);