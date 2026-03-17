import type { Activity } from '../types'

interface ActivityItemProps {
  activity: Activity
}

export default function ActivityItem({ activity }: ActivityItemProps) {
  return (
    <ActivityListItem
      message={activity.message}
      apiPath={activity.apiPath}
      timeAgo={activity.timeAgo}
    />
  )
}

export interface ActivityListItemProps {
  message: string
  apiPath: string
  timeAgo: string
}

export function ActivityListItem({ message, apiPath, timeAgo }: ActivityListItemProps) {
  return (
    <li className="flex items-center justify-between py-4">
      <div>
        <p className="typo-body-2-normal font-medium text-label-normal">{message}</p>
        <p className="typo-caption-1 text-label-assistant">{apiPath}</p>
      </div>
      <span className="typo-caption-1 text-label-assistant">{timeAgo}</span>
    </li>
  )
}
