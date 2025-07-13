import { useState, useEffect } from 'react'
import { blink } from '../blink/client'
import { Button } from './ui/button'
import { Card, CardContent, CardHeader } from './ui/card'
import { Avatar, AvatarFallback, AvatarImage } from './ui/avatar'
import { Textarea } from './ui/textarea'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from './ui/dialog'
import { Badge } from './ui/badge'
import { Separator } from './ui/separator'
import { 
  Satellite, 
  Home, 
  Search, 
  Bell, 
  Mail, 
  User, 
  Settings,
  Plus,
  Heart,
  MessageCircle,
  Share,
  MoreHorizontal,
  Image as ImageIcon,
  LogOut,
  Users,
  TrendingUp
} from 'lucide-react'

interface MainAppProps {
  user: any
}

interface Post {
  id: string
  userId: string
  content: string
  imageUrl?: string
  likesCount: number
  commentsCount: number
  sharesCount: number
  createdAt: string
  user?: {
    displayName: string
    username: string
    avatarUrl?: string
  }
  isLiked?: boolean
}

interface UserProfile {
  id: string
  email: string
  displayName?: string
  username?: string
  bio?: string
  avatarUrl?: string
  followersCount: number
  followingCount: number
  postsCount: number
}

export default function MainApp({ user }: MainAppProps) {
  const [activeTab, setActiveTab] = useState('home')
  const [posts, setPosts] = useState<Post[]>([])
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null)
  const [newPostContent, setNewPostContent] = useState('')
  const [isCreatePostOpen, setIsCreatePostOpen] = useState(false)
  const [loading, setLoading] = useState(true)

  // Initialize user profile
  useEffect(() => {
    const initializeUser = async () => {
      try {
        // Check if user profile exists by email OR by ID
        const existingUsersByEmail = await blink.db.users.list({
          where: { email: user.email },
          limit: 1
        })
        
        const existingUsersById = await blink.db.users.list({
          where: { id: user.id },
          limit: 1
        })

        // If user exists by either email or ID, use the existing profile
        if (existingUsersByEmail.length > 0) {
          setUserProfile(existingUsersByEmail[0])
          return
        }
        
        if (existingUsersById.length > 0) {
          setUserProfile(existingUsersById[0])
          return
        }

        // Generate unique username
        const baseUsername = user.email.split('@')[0].toLowerCase()
        let username = baseUsername
        let attempt = 0
        
        // Keep trying until we find a unique username
        while (attempt < 10) { // Limit attempts to prevent infinite loop
          try {
            const existingUsernames = await blink.db.users.list({
              where: { username: username },
              limit: 1
            })
            
            if (existingUsernames.length === 0) {
              // Username is available, create user
              const newUser = await blink.db.users.create({
                id: user.id,
                email: user.email,
                displayName: user.email.split('@')[0],
                username: username,
                followersCount: 0,
                followingCount: 0,
                postsCount: 0
              })
              setUserProfile(newUser)
              return
            } else {
              // Username taken, try with number suffix
              attempt++
              username = `${baseUsername}${attempt}`
            }
          } catch (createError) {
            // If it's a constraint error, try next username
            if (createError.message?.includes('UNIQUE constraint failed')) {
              attempt++
              username = `${baseUsername}${attempt}`
              continue
            } else {
              throw createError
            }
          }
        }
        
        // If we couldn't find a unique username after 10 attempts, use timestamp
        const timestampUsername = `${baseUsername}_${Date.now()}`
        const newUser = await blink.db.users.create({
          id: user.id,
          email: user.email,
          displayName: user.email.split('@')[0],
          username: timestampUsername,
          followersCount: 0,
          followingCount: 0,
          postsCount: 0
        })
        setUserProfile(newUser)
      } catch (error) {
        console.error('Error initializing user:', error)
        // Show user-friendly error message
        alert('There was an issue setting up your profile. Please refresh the page and try again.')
      }
    }

    initializeUser()
  }, [user])

  // Load posts
  useEffect(() => {
    const loadPosts = async () => {
      try {
        setLoading(true)
        const postsData = await blink.db.posts.list({
          orderBy: { createdAt: 'desc' },
          limit: 20
        })

        // Get user data for each post
        const postsWithUsers = await Promise.all(
          postsData.map(async (post) => {
            const postUser = await blink.db.users.list({
              where: { id: post.userId },
              limit: 1
            })
            
            // Check if current user liked this post
            const likes = await blink.db.likes.list({
              where: { 
                AND: [
                  { userId: user.id },
                  { postId: post.id }
                ]
              },
              limit: 1
            })

            return {
              ...post,
              user: postUser[0] ? {
                displayName: postUser[0].displayName || postUser[0].email.split('@')[0],
                username: postUser[0].username || postUser[0].email.split('@')[0],
                avatarUrl: postUser[0].avatarUrl
              } : undefined,
              isLiked: likes.length > 0
            }
          })
        )

        setPosts(postsWithUsers)
      } catch (error) {
        console.error('Error loading posts:', error)
      } finally {
        setLoading(false)
      }
    }

    if (userProfile) {
      loadPosts()
    }
  }, [userProfile, user.id])

  const handleCreatePost = async () => {
    if (!newPostContent.trim() || !userProfile) return

    try {
      const newPost = await blink.db.posts.create({
        id: `post_${Date.now()}`,
        userId: user.id,
        content: newPostContent,
        likesCount: 0,
        commentsCount: 0,
        sharesCount: 0
      })

      // Update user's post count
      await blink.db.users.update(userProfile.id, {
        postsCount: userProfile.postsCount + 1
      })

      // Add to posts list
      setPosts(prev => [{
        ...newPost,
        user: {
          displayName: userProfile.displayName || userProfile.email.split('@')[0],
          username: userProfile.username || userProfile.email.split('@')[0],
          avatarUrl: userProfile.avatarUrl
        },
        isLiked: false
      }, ...prev])

      setNewPostContent('')
      setIsCreatePostOpen(false)
      
      // Update local user profile
      setUserProfile(prev => prev ? { ...prev, postsCount: prev.postsCount + 1 } : null)
    } catch (error) {
      console.error('Error creating post:', error)
    }
  }

  const handleLikePost = async (postId: string, isCurrentlyLiked: boolean) => {
    try {
      if (isCurrentlyLiked) {
        // Unlike
        const likes = await blink.db.likes.list({
          where: { 
            AND: [
              { userId: user.id },
              { postId: postId }
            ]
          },
          limit: 1
        })
        
        if (likes.length > 0) {
          await blink.db.likes.delete(likes[0].id)
        }

        // Update post likes count
        const post = posts.find(p => p.id === postId)
        if (post) {
          await blink.db.posts.update(postId, {
            likesCount: Math.max(0, post.likesCount - 1)
          })
        }
      } else {
        // Like
        await blink.db.likes.create({
          id: `like_${Date.now()}`,
          userId: user.id,
          postId: postId
        })

        // Update post likes count
        const post = posts.find(p => p.id === postId)
        if (post) {
          await blink.db.posts.update(postId, {
            likesCount: post.likesCount + 1
          })
        }
      }

      // Update local state
      setPosts(prev => prev.map(post => 
        post.id === postId 
          ? { 
              ...post, 
              isLiked: !isCurrentlyLiked,
              likesCount: isCurrentlyLiked ? post.likesCount - 1 : post.likesCount + 1
            }
          : post
      ))
    } catch (error) {
      console.error('Error toggling like:', error)
    }
  }

  const handleLogout = () => {
    blink.auth.logout()
  }

  const formatTimeAgo = (dateString: string) => {
    const date = new Date(dateString)
    const now = new Date()
    const diffInSeconds = Math.floor((now.getTime() - date.getTime()) / 1000)
    
    if (diffInSeconds < 60) return 'just now'
    if (diffInSeconds < 3600) return `${Math.floor(diffInSeconds / 60)}m`
    if (diffInSeconds < 86400) return `${Math.floor(diffInSeconds / 3600)}h`
    return `${Math.floor(diffInSeconds / 86400)}d`
  }

  const sidebarItems = [
    { id: 'home', icon: Home, label: 'Home', active: true },
    { id: 'explore', icon: Search, label: 'Explore' },
    { id: 'notifications', icon: Bell, label: 'Notifications' },
    { id: 'messages', icon: Mail, label: 'Messages' },
    { id: 'profile', icon: User, label: 'Profile' },
    { id: 'settings', icon: Settings, label: 'Settings' }
  ]

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Sidebar */}
      <div className="fixed left-0 top-0 h-full w-64 bg-white border-r border-gray-200 z-10">
        <div className="p-6">
          <div className="flex items-center space-x-2 mb-8">
            <div className="w-8 h-8 bg-gradient-to-r from-indigo-500 to-pink-500 rounded-lg flex items-center justify-center">
              <Satellite className="w-5 h-5 text-white" />
            </div>
            <h1 className="text-xl font-bold text-gray-900">SatelliteMedia</h1>
          </div>

          <nav className="space-y-2">
            {sidebarItems.map((item) => (
              <button
                key={item.id}
                onClick={() => setActiveTab(item.id)}
                className={`w-full flex items-center space-x-3 px-4 py-3 rounded-lg text-left transition-colors ${
                  activeTab === item.id
                    ? 'bg-indigo-50 text-indigo-600'
                    : 'text-gray-700 hover:bg-gray-100'
                }`}
              >
                <item.icon className="w-5 h-5" />
                <span className="font-medium">{item.label}</span>
              </button>
            ))}
          </nav>

          <div className="mt-8 pt-8 border-t border-gray-200">
            <div className="flex items-center space-x-3 mb-4">
              <Avatar className="w-10 h-10">
                <AvatarImage src={userProfile?.avatarUrl} />
                <AvatarFallback className="bg-indigo-500 text-white">
                  {userProfile?.displayName?.[0]?.toUpperCase() || user.email[0].toUpperCase()}
                </AvatarFallback>
              </Avatar>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-gray-900 truncate">
                  {userProfile?.displayName || user.email.split('@')[0]}
                </p>
                <p className="text-xs text-gray-500 truncate">@{userProfile?.username || user.email.split('@')[0]}</p>
              </div>
            </div>
            
            <Button
              onClick={handleLogout}
              variant="outline"
              size="sm"
              className="w-full"
            >
              <LogOut className="w-4 h-4 mr-2" />
              Logout
            </Button>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="ml-64">
        {/* Top Bar */}
        <div className="sticky top-0 bg-white/80 backdrop-blur-lg border-b border-gray-200 z-5">
          <div className="px-6 py-4">
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-semibold text-gray-900">
                {activeTab === 'home' && 'Home'}
                {activeTab === 'explore' && 'Explore'}
                {activeTab === 'notifications' && 'Notifications'}
                {activeTab === 'messages' && 'Messages'}
                {activeTab === 'profile' && 'Profile'}
                {activeTab === 'settings' && 'Settings'}
              </h2>
              
              {activeTab === 'home' && (
                <Dialog open={isCreatePostOpen} onOpenChange={setIsCreatePostOpen}>
                  <DialogTrigger asChild>
                    <Button className="bg-indigo-600 hover:bg-indigo-700">
                      <Plus className="w-4 h-4 mr-2" />
                      New Post
                    </Button>
                  </DialogTrigger>
                  <DialogContent className="sm:max-w-md">
                    <DialogHeader>
                      <DialogTitle>Create a new post</DialogTitle>
                    </DialogHeader>
                    <div className="space-y-4">
                      <div className="flex items-start space-x-3">
                        <Avatar className="w-10 h-10">
                          <AvatarImage src={userProfile?.avatarUrl} />
                          <AvatarFallback className="bg-indigo-500 text-white">
                            {userProfile?.displayName?.[0]?.toUpperCase() || user.email[0].toUpperCase()}
                          </AvatarFallback>
                        </Avatar>
                        <div className="flex-1">
                          <Textarea
                            placeholder="What's happening?"
                            value={newPostContent}
                            onChange={(e) => setNewPostContent(e.target.value)}
                            className="min-h-[100px] resize-none border-0 p-0 text-lg placeholder:text-gray-500 focus-visible:ring-0"
                          />
                        </div>
                      </div>
                      
                      <div className="flex items-center justify-between pt-4 border-t">
                        <Button variant="ghost" size="sm">
                          <ImageIcon className="w-4 h-4 mr-2" />
                          Photo
                        </Button>
                        <Button 
                          onClick={handleCreatePost}
                          disabled={!newPostContent.trim()}
                          className="bg-indigo-600 hover:bg-indigo-700"
                        >
                          Post
                        </Button>
                      </div>
                    </div>
                  </DialogContent>
                </Dialog>
              )}
            </div>
          </div>
        </div>

        {/* Content Area */}
        <div className="p-6">
          {activeTab === 'home' && (
            <div className="max-w-2xl mx-auto space-y-6">
              {loading ? (
                <div className="text-center py-8">
                  <div className="text-gray-500">Loading posts...</div>
                </div>
              ) : posts.length === 0 ? (
                <div className="text-center py-12">
                  <div className="text-gray-500 mb-4">No posts yet</div>
                  <p className="text-sm text-gray-400">Be the first to share something!</p>
                </div>
              ) : (
                posts.map((post) => (
                  <Card key={post.id} className="border border-gray-200">
                    <CardHeader className="pb-3">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center space-x-3">
                          <Avatar className="w-10 h-10">
                            <AvatarImage src={post.user?.avatarUrl} />
                            <AvatarFallback className="bg-indigo-500 text-white">
                              {post.user?.displayName?.[0]?.toUpperCase() || 'U'}
                            </AvatarFallback>
                          </Avatar>
                          <div>
                            <p className="font-semibold text-gray-900">{post.user?.displayName}</p>
                            <p className="text-sm text-gray-500">@{post.user?.username} · {formatTimeAgo(post.createdAt)}</p>
                          </div>
                        </div>
                        <Button variant="ghost" size="sm">
                          <MoreHorizontal className="w-4 h-4" />
                        </Button>
                      </div>
                    </CardHeader>
                    <CardContent className="pt-0">
                      <p className="text-gray-900 mb-4 whitespace-pre-wrap">{post.content}</p>
                      
                      {post.imageUrl && (
                        <div className="mb-4">
                          <img 
                            src={post.imageUrl} 
                            alt="Post image" 
                            className="rounded-lg w-full max-h-96 object-cover"
                          />
                        </div>
                      )}
                      
                      <div className="flex items-center justify-between pt-3 border-t border-gray-100">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleLikePost(post.id, post.isLiked || false)}
                          className={`${post.isLiked ? 'text-red-500 hover:text-red-600' : 'text-gray-500 hover:text-red-500'}`}
                        >
                          <Heart className={`w-4 h-4 mr-2 ${post.isLiked ? 'fill-current' : ''}`} />
                          {post.likesCount}
                        </Button>
                        <Button variant="ghost" size="sm" className="text-gray-500 hover:text-blue-500">
                          <MessageCircle className="w-4 h-4 mr-2" />
                          {post.commentsCount}
                        </Button>
                        <Button variant="ghost" size="sm" className="text-gray-500 hover:text-green-500">
                          <Share className="w-4 h-4 mr-2" />
                          {post.sharesCount}
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                ))
              )}
            </div>
          )}

          {activeTab === 'profile' && userProfile && (
            <div className="max-w-2xl mx-auto">
              <Card className="border border-gray-200">
                <CardContent className="p-6">
                  <div className="flex items-start space-x-4">
                    <Avatar className="w-20 h-20">
                      <AvatarImage src={userProfile.avatarUrl} />
                      <AvatarFallback className="bg-indigo-500 text-white text-2xl">
                        {userProfile.displayName?.[0]?.toUpperCase() || user.email[0].toUpperCase()}
                      </AvatarFallback>
                    </Avatar>
                    <div className="flex-1">
                      <h3 className="text-xl font-bold text-gray-900">{userProfile.displayName}</h3>
                      <p className="text-gray-500">@{userProfile.username}</p>
                      {userProfile.bio && (
                        <p className="text-gray-700 mt-2">{userProfile.bio}</p>
                      )}
                      <div className="flex items-center space-x-6 mt-4">
                        <div className="text-center">
                          <p className="font-bold text-gray-900">{userProfile.postsCount}</p>
                          <p className="text-sm text-gray-500">Posts</p>
                        </div>
                        <div className="text-center">
                          <p className="font-bold text-gray-900">{userProfile.followingCount}</p>
                          <p className="text-sm text-gray-500">Following</p>
                        </div>
                        <div className="text-center">
                          <p className="font-bold text-gray-900">{userProfile.followersCount}</p>
                          <p className="text-sm text-gray-500">Followers</p>
                        </div>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          )}

          {activeTab === 'explore' && (
            <div className="max-w-4xl mx-auto">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <Card className="border border-gray-200">
                  <CardHeader>
                    <div className="flex items-center space-x-2">
                      <TrendingUp className="w-5 h-5 text-indigo-600" />
                      <h3 className="font-semibold">Trending</h3>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-3">
                      <div className="text-sm">
                        <p className="font-medium text-gray-900">#SatelliteMedia</p>
                        <p className="text-gray-500">12.5K posts</p>
                      </div>
                      <div className="text-sm">
                        <p className="font-medium text-gray-900">#TechNews</p>
                        <p className="text-gray-500">8.2K posts</p>
                      </div>
                      <div className="text-sm">
                        <p className="font-medium text-gray-900">#SocialMedia</p>
                        <p className="text-gray-500">5.7K posts</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                <Card className="border border-gray-200">
                  <CardHeader>
                    <div className="flex items-center space-x-2">
                      <Users className="w-5 h-5 text-indigo-600" />
                      <h3 className="font-semibold">Suggested Users</h3>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-3">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center space-x-2">
                          <Avatar className="w-8 h-8">
                            <AvatarFallback className="bg-pink-500 text-white text-xs">JD</AvatarFallback>
                          </Avatar>
                          <div>
                            <p className="text-sm font-medium">John Doe</p>
                            <p className="text-xs text-gray-500">@johndoe</p>
                          </div>
                        </div>
                        <Button size="sm" variant="outline">Follow</Button>
                      </div>
                      <div className="flex items-center justify-between">
                        <div className="flex items-center space-x-2">
                          <Avatar className="w-8 h-8">
                            <AvatarFallback className="bg-green-500 text-white text-xs">AS</AvatarFallback>
                          </Avatar>
                          <div>
                            <p className="text-sm font-medium">Alice Smith</p>
                            <p className="text-xs text-gray-500">@alicesmith</p>
                          </div>
                        </div>
                        <Button size="sm" variant="outline">Follow</Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </div>
            </div>
          )}

          {(activeTab === 'notifications' || activeTab === 'messages' || activeTab === 'settings') && (
            <div className="max-w-2xl mx-auto text-center py-12">
              <div className="text-gray-500 mb-4">
                {activeTab === 'notifications' && 'No notifications yet'}
                {activeTab === 'messages' && 'No messages yet'}
                {activeTab === 'settings' && 'Settings coming soon'}
              </div>
              <p className="text-sm text-gray-400">This feature will be available soon!</p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}