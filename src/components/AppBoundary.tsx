import {Component,type ReactNode} from 'react';

/** Keep local storage intact when an unexpected renderer failure interrupts a session. */
export default class AppBoundary extends Component<{children:ReactNode},{failed:boolean}> {
  state={failed:false};
  static getDerivedStateFromError(){return{failed:true};}
  render(){
    if(!this.state.failed)return this.props.children;
    return <main className="app-recovery"><div className="eyebrow">ASTERLOOM · NIMESHBUILDS</div><h1>Let’s reopen your world.</h1><p>Asterloom encountered a display problem. Your saved notebooks and progress remain on this device. Recent changes that had not finished saving may need to be repeated.</p><button className="button primary" onClick={()=>window.location.reload()}>Reopen Asterloom</button><p className="small muted">If this happens again, close and reopen the app. Keep your local app data so your saved work stays available.</p></main>;
  }
}
