export const IntroCard = ({ icon, title, href }) => {
  return (
    <a
      href={href}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '6px',
        padding: '10px 16px',
        borderRadius: '14px',
        backgroundColor: 'transparent',
        textDecoration: 'none',
        height: '44px',
        width: 'fit-content',
      }}
      className="intro-card border border-[#000] dark:border-[#fff] hover:!border-primary dark:hover:!border-primary-light transition-colors"
    >
      <Icon icon={icon} className="w-[18px] h-[18px] text-blue-600 dark:text-blue-500" />
      <span style={{ fontSize: '16px', fontWeight: 600, lineHeight: 1 }} className="text-gray-900 dark:text-white">
        {title}
      </span>
    </a>
  )
};
