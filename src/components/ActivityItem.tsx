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
        <p className="text-body font-medium text-neutral-900">{message}</p>
        <p className="text-details text-neutral-500">{apiPath}</p>
      </div>
      <span className="text-details text-neutral-400">{timeAgo}</span>
    </li>
  )
}
