import Link from "next/link"

export function Footer() {
  return (
    <footer className="bg-gray-100 border-t mt-12">
      <div className="container mx-auto px-4 py-8">
        <div className="flex flex-col md:flex-row justify-between items-center gap-4">
          <div className="text-sm text-gray-600">© 2024 Isshoo. 한국 인기 커뮤니티 이슈 모음 서비스</div>
          <div className="flex gap-6 text-sm">
            <Link href="/terms" className="text-gray-600 hover:text-gray-900">
              이용약관
            </Link>
            <Link href="/privacy" className="text-gray-600 hover:text-gray-900">
              개인정보처리방침
            </Link>
            <Link href="/contact" className="text-gray-600 hover:text-gray-900">
              문의하기
            </Link>
            <Link href="/about" className="text-gray-600 hover:text-gray-900">
              서비스 소개
            </Link>
          </div>
        </div>
      </div>
    </footer>
  )
}
