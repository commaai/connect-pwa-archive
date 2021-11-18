import React, { Component } from 'react';
import { connect } from 'react-redux';
import Obstruction from 'obstruction';
import fecha from 'fecha';
import * as Sentry from '@sentry/react';
import { withStyles, Typography, IconButton, Button, CircularProgress, List, ListItem, ListItemIcon, ListItemText,
  Tooltip } from '@material-ui/core';
import KeyboardBackspaceIcon from '@material-ui/icons/KeyboardBackspace';
import ErrorIcon from '@material-ui/icons/ErrorOutline';
import InfoOutlineIcon from '@material-ui/icons/InfoOutline';
import CheckIcon from '@material-ui/icons/Check';

import { billing as Billing } from '@commaai/comma-api';

import { deviceTypePretty } from '../../utils';
import ResizeHandler from '../ResizeHandler';
import Colors from '../../colors';
import { primeNav } from '../../actions';

const styles = (theme) => ({
  primeBox: {
    display: 'flex',
    flexDirection: 'column',
    maxWidth: 500,
    color: '#fff',
  },
  primeHeader: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    maxWidth: 410,
    flexDirection: 'row',
    paddingRight: 20,
  },
  headerDevice: {
    display: 'flex',
    alignItems: 'center',
    '& :first-child': { marginRight: 8 },
  },
  primeBlock: {
    marginTop: 10,
  },
  moreInfoContainer: {
    '& p': { display: 'inline' },
    '& button': { display: 'inline', marginLeft: '15px' },
  },
  checkList: {
    marginLeft: 10,
    marginBottom: 10,
  },
  checkListItem: {
    padding: '5px 0',
    '& svg': { margin: 0 },
  },
  deviceId: {
    color: '#525E66',
  },
  leftMargin: {
    marginLeft: 10,
  },
  deviceBlock: {
    marginLeft: 10,
    '& aside': { display: 'inline', marginRight: 5, },
    '& span': { display: 'inline', },
  },
  overviewBlockError: {
    marginTop: 10,
    padding: 10,
    display: 'flex',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 0, 0, 0.2)',
    '& p': { display: 'inline-block', marginLeft: 10 },
  },
  chargeText: {
    fontSize: 13,
  },
  buttons: {
    background: Colors.white,
    color: '#404B4F',
    textTransform: 'none',
    '&:hover': {
      backgroundColor: Colors.white70,
      color: '#404B4F',
    },
    '&:disabled': {
      backgroundColor: Colors.white70,
      color: '#404B4F',
    },
    '&:disabled:hover': {
      backgroundColor: Colors.white70,
      color: '#404B4F',
    }
  },
  checkList: {
    marginLeft: 12,
    '& span': { fontSize: 14 },
  },
  checkListItem: {
    padding: 0,
    '& svg': {
      alignSelf: 'flex-start',
      fontSize: 21,
      marginRight: 0,
    },
  },
  learnMore: {
    '& a': { color: 'white' },
  },
  primeTitle: {
    margin: '0 12px',
  },
  planBox: {
    display: 'flex',
    flexDirection: 'row',
    justifyContent: 'space-around',
    height: 140,
  },
  plan: {
    cursor: 'pointer',
    WebkitTapHighlightColor: 'transparent',
    width: 165,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'space-around',
    border: `2px solid transparent`,
    backgroundColor: Colors.white10,
    padding: '8px 0',
    borderRadius: 18,
    fontWeight: 600,
    textAlign: 'center',
    position: 'relative',
    '&:first-child': { marginRight: 2 },
    '&:last-child': { marginLeft: 2 },
    '& p': {
      margin: 0,
    },
  },
  planName: {
    fontSize: '1.2rem',
  },
  planPrice: {
    fontSize: '1.5rem',
  },
  planSubtext: {
    fontWeight: 'normal',
    fontSize: '0.8rem',
  },
  planDisabled: {
    backgroundColor: Colors.white05,
    color: Colors.white40,
    cursor: 'default',
  },
  planDisabledHelp: {
    color: Colors.white,
    position: 'absolute',
    top: 6,
    right: 6,
  },
  planDisabledTooltip: {
    margin: '6px 0',
    fontSize: '0.8rem',
  },
  planInfoLoading: {
    backgroundColor: Colors.white03,
    color: Colors.white20,
    cursor: 'default',
  },
  planLoading: {
    position: 'absolute',
    top: 0,
    width: '100%',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    height: 140,
    '& p': {
      marginTop: 10,
      fontSize: '0.9rem',
    },
  },
});

class PrimeCheckout extends Component {
  constructor(props) {
    super(props);

    this.state = {
      error: null,
      loadingCheckout: false,
      selectedPlan: null,
      disabledPlanTooltip: false,
      windowWidth: window.innerWidth,
    };

    this.gotoCheckout = this.gotoCheckout.bind(this);
    this.trialClaimable = this.trialClaimable.bind(this);
  }

  componentDidMount() {
    this.componentDidUpdate({});
  }

  componentDidUpdate(prevProps) {
    const { stripe_cancelled, subscribeInfo } = this.props;
    if (!prevProps.stripe_cancelled && stripe_cancelled) {
      this.setState({ error: 'Checkout cancelled' });
    }

    if (!prevProps.subscribeInfo && prevProps.subscribeInfo !== subscribeInfo) {
      const plan = subscribeInfo.sim_id && subscribeInfo.is_prime_sim ? 'data' : 'nodata';
      this.setState({ selectedPlan: plan });
    }
  }

  onPrimeActivated(resp) {
    if (resp.success) {
      this.setState({ activated: resp, error: null });
      Billing.getSubscription(this.props.dongleId).then((subscription) => {
        this.setState({ new_subscription: subscription });
      }).catch((err) => {
        console.log(err);
        Sentry.captureException(err, { fingerprint: 'prime_checkout_activated_fetch_sub' });
      });
    } else if (resp.error) {
      this.setState({ error: resp.error });
    }
  }

  async gotoCheckout() {
    const { dongleId, subscribeInfo } =  this.props;
    this.setState({ loadingCheckout: true });
    try {
      const resp = await Billing.getStripeCheckout(dongleId, subscribeInfo.sim_id, this.state.selectedPlan);
      window.location = resp.url;
    } catch (err) {
      // TODO show error messages
      console.log(err);
      Sentry.captureException(err, { fingerprint: 'prime_goto_stripe_checkout' });
    }
  }

  trialClaimable() {
    const { subscribeInfo } = this.props;
    const { selectedPlan } = this.state;
    if (!subscribeInfo) {
      return null;
    }
    if (selectedPlan === 'data') {
      return subscribeInfo.trial_claimable;
    } else if (selectedPlan === 'nodata') {
      return subscribeInfo.trial_claimable_nodata;
    } else {
      return subscribeInfo.trial_claimable && subscribeInfo.trial_claimable_nodata;
    }
  }

  render() {
    const { classes, device, subscribeInfo } = this.props;
    const { windowWidth, error, loadingCheckout, selectedPlan, disabledPlanTooltip } = this.state;

    const listItems = [
      ['24/7 connectivity', null],
      ['Take pictures remotely', null],
      ['1 year storage of drive videos', null],
      ['Simple SSH for developers', null],
      ['Turn-by-turn navigation', 'comma three only'],
    ];

    let chargeText = null;
    if (selectedPlan && this.trialClaimable()) {
      const trialEndDate = fecha.format(this.props.subscribeInfo.trial_end * 1000, "MMMM Do");
      const claimEndDate = Boolean(subscribeInfo.trial_claim_end && selectedPlan == 'data') ?
        fecha.format(subscribeInfo.trial_claim_end * 1000, "MMMM Do") :
        null;
      chargeText = `Your first charge will be on ${trialEndDate}, then monthly thereafter.` +
        (claimEndDate ? ` Trial offer only valid until ${claimEndDate}.` : '');
    }

    const alias = device.alias || deviceTypePretty(device.device_type);
    const containerPadding = windowWidth > 520 ? '24px 36px 36px' : '2px 12px 12px';
    const blockMargin = windowWidth > 520 ? { marginTop: 20 } : { marginTop: 10 };
    const buttonSize = windowWidth > 520 ?
      { height: 42, borderRadius: 21, width: 350 } :
      { height: 32, borderRadius: 18, width: '100%' };
    const paddingStyle = windowWidth > 520 ? { paddingLeft: 7, paddingRight: 7 } : { paddingLeft: 8, paddingRight: 8 };
    const selectedStyle = { border: '2px solid white' };
    const plansLoadingClass = !subscribeInfo ? classes.planInfoLoading : '';
    const disabledDataPlan = Boolean(!subscribeInfo || !subscribeInfo.sim_id || !subscribeInfo.is_prime_sim);

    let disabledDataPlanText;
    if (subscribeInfo && disabledDataPlan) {
      if (!subscribeInfo.sim_id && subscribeInfo.device_online) {
        disabledDataPlanText = 'No SIM inserted. Ensure SIM is securely inserted and try again.';
      } else if (!subscribeInfo.sim_id) {
        disabledDataPlanText = 'Could not reach device, connect device to the internet and try again.';
      } else if (!subscribeInfo.is_prime_sim) {
        disabledDataPlanText = 'Third-party SIM detected, comma prime with data plan cannot be activated.';
      }
    }

    return ( <>
      <div className={ classes.primeBox } style={{ padding: containerPadding }}>
        <ResizeHandler onResize={ (windowWidth) => this.setState({ windowWidth }) } />
        <div className={ classes.primeHeader }>
          <IconButton aria-label="Go Back" onClick={() => this.props.dispatch(primeNav(false)) }>
            <KeyboardBackspaceIcon />
          </IconButton>
          <div className={ classes.headerDevice }>
            <Typography variant="body2">{ alias }</Typography>
            <Typography variant="caption" className={classes.deviceId}>({ device.dongle_id })</Typography>
          </div>
        </div>
        <h2 className={ classes.primeTitle }>comma prime</h2>
        <div style={ blockMargin }>
          <List className={ classes.checkList }>
            { listItems.map((listItemText, i) => {
              return <ListItem key={ i } className={ classes.checkListItem } style={ paddingStyle }>
                <ListItemIcon><CheckIcon /></ListItemIcon>
                <ListItemText primary={ listItemText[0] } secondary={ listItemText[1] } />
              </ListItem>;
            }) }
          </List>
        </div>
        <div style={{ ...blockMargin, position: 'relative' }}>
          <div className={ classes.planBox }>
            <div className={ `${classes.plan} ${plansLoadingClass}` }
              style={ selectedPlan === 'nodata' ? selectedStyle : {} }
              onClick={ Boolean(subscribeInfo) ? () => this.setState({ selectedPlan: 'nodata' }) : null }>
              <p className={ classes.planName }>basic</p>
              <p className={ classes.planPrice }>$16/month</p>
              <p className={ classes.planSubtext }>bring your own<br />sim card</p>
            </div>
            <div className={ `${classes.plan} ${disabledDataPlan ? classes.planDisabled : ''} ${plansLoadingClass}` }
              style={ selectedPlan === 'data' ? selectedStyle : {} }
              onClick={ !disabledDataPlan ? () => this.setState({ selectedPlan: 'data' }) : null }>
              { Boolean(subscribeInfo && disabledDataPlan) &&
                <Tooltip open={ disabledPlanTooltip } title={ disabledDataPlanText } disableHoverListener={ true }
                  classes={{ tooltip: classes.planDisabledTooltip }} disableFocusListener={ true } disableTouchListener={ true }>
                  <InfoOutlineIcon className={ classes.planDisabledHelp }
                    onMouseEnter={ () => this.setState({ disabledPlanTooltip: true }) }
                    onMouseLeave={ () => this.setState({ disabledPlanTooltip: false }) } />
                </Tooltip>
              }
              <p className={ classes.planName }>standard</p>
              <p className={ classes.planPrice }>$24/month</p>
              <p className={ classes.planSubtext }>unlimited 512kbps data<br />only offered in the U.S.</p>
            </div>
          </div>
          { !subscribeInfo &&
            <div className={ classes.planLoading }>
              <CircularProgress size={ 38 } style={{ color: Colors.white }} />
              <Typography>Fetching SIM data</Typography>
            </div>
          }
        </div>
        <div style={ blockMargin }>
          <Typography className={ classes.learnMore }>
            Learn more about comma prime from our <a target="_blank" href="https://comma.ai/prime#faq">FAQ</a>
          </Typography>
        </div>
        { error && <div className={ classes.overviewBlockError }>
          <ErrorIcon />
          <Typography>{ error }</Typography>
        </div> }
        <div style={ blockMargin }>
          <Button style={ buttonSize } className={ `${classes.buttons} gotoCheckout` }
            onClick={ () => this.gotoCheckout() }
            disabled={ Boolean(!subscribeInfo || loadingCheckout || !selectedPlan) }>
            { loadingCheckout ?
              <CircularProgress size={ 19 } /> :
              (this.trialClaimable() ? 'Claim trial' : 'Go to checkout')
            }
          </Button>
        </div>
        { chargeText &&
          <div style={ blockMargin }>
            <Typography className={ classes.chargeText }>{ chargeText }</Typography>
          </div>
        }
      </div>
    </> );
  }
}

const stateToProps = Obstruction({
  dongleId: 'workerState.dongleId',
  device: 'workerState.device',
  subscribeInfo: 'workerState.subscribeInfo',
});

export default connect(stateToProps)(withStyles(styles)(PrimeCheckout));

