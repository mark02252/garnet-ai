import { collectorRegistry } from './registry';
import { SerperCollector } from './serper-collector';
import { NaverCollector } from './naver-collector';
import { YouTubeCollector } from './youtube-collector';
import { TwitterCollector } from './twitter-collector';
import { RedditCollector } from './reddit-collector';

let registered = false;

export function initCollectors(): void {
  if (registered) return;
  registered = true;

  collectorRegistry.register(new SerperCollector());
  collectorRegistry.register(new NaverCollector());
  collectorRegistry.register(new YouTubeCollector());
  collectorRegistry.register(new TwitterCollector());
  collectorRegistry.register(new RedditCollector());
}
