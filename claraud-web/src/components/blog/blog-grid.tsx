'use client';

import Link from 'next/link';

import { motion } from 'framer-motion';
import { Clock, User } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { BlogPost } from '@/lib/blog';

export function BlogGrid({ posts }: { posts: BlogPost[] }) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
      {posts.map((post, idx) => (
        <motion.div
          key={post.slug}
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5, delay: idx * 0.1 }}
        >
          <Link href={`/blog/${post.slug}`} className="group h-full block">
            <div className="glass rounded-2xl overflow-hidden border border-white/10 hover:border-blue-500/30 transition-all h-full flex flex-col">
              {/* Image Placeholder */}
              <div className="aspect-video w-full bg-gradient-to-br from-blue-600/20 to-purple-600/20 relative">
                <Badge className="absolute top-4 left-4 bg-blue-600 text-white border-none">
                  {post.category}
                </Badge>
              </div>

              <div className="p-6 flex-1 flex flex-col">
                <h2 className="text-xl font-bold text-white mb-3 group-hover:text-blue-400 transition-colors line-clamp-2">
                  {post.title}
                </h2>
                <p className="text-text-secondary text-sm line-clamp-3 mb-6 flex-1">
                  {post.description}
                </p>

                <div className="flex items-center gap-4 text-[10px] uppercase tracking-widest font-bold text-text-secondary pt-6 border-t border-white/5">
                  <div className="flex items-center gap-1.5">
                    <User className="w-3 h-3 text-blue-400" />
                    <span>{post.author}</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <Clock className="w-3 h-3 text-blue-400" />
                    <span>{post.readingTime}</span>
                  </div>
                </div>
              </div>
            </div>
          </Link>
        </motion.div>
      ))}
    </div>
  );
}
